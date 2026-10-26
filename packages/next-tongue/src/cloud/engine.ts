/**
 * Translation engine around the Loomlocale API: placeholder masking,
 * glossary, ICU/plural parity checks and the tongue.lock hash ledger.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { collectArgs } from '../compiler/ast.js';
import { parseMessage } from '../compiler/parse/icu-parser.js';
import { checkPluralCategories } from '../compiler/validate/plurals.js';
import { resolveInsideProject } from '../cli/safe-path.js';
import type { GlossaryTerms, Job, LoomlocaleClient, TranslateItem } from './api.js';

export function sha(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

export function maskIcu(source: string): { masked: string; restore: (out: string) => string | null } {
  const tokens: string[] = [];
  const masked = source.replace(/\{[^{}]+\}|<(\/)?([A-Za-z][\w]*)\s*\/?>/g, (m) => {
    const id = `__TONGUE_${tokens.length}__`;
    tokens.push(m);
    return id;
  });
  return {
    masked,
    restore(out: string) {
      let result = out;
      for (let i = 0; i < tokens.length; i++) {
        const id = `__TONGUE_${i}__`;
        if (!result.includes(id)) return null;
        result = result.split(id).join(tokens[i]!);
      }
      if (/__TONGUE_\d+__/.test(result)) return null;
      return result;
    },
  };
}

/** Billable characters (Loomlocale bills source chars × target locales). */
export function countChars(text: string): number {
  return [...text].length;
}

export function validateParity(source: string, target: string, locale: string): void {
  const sa = collectArgs(parseMessage(source, { file: 'src', key: 'k' }));
  const ta = collectArgs(parseMessage(target, { file: 'tgt', key: 'k' }));
  const missing = Object.keys(sa).filter((a) => !(a in ta));
  const extra = Object.keys(ta).filter((a) => !(a in sa));
  if (missing.length || extra.length) {
    throw new Error(`arg mismatch missing=[${missing}] extra=[${extra}]`);
  }
  for (const issue of checkPluralCategories(parseMessage(target, { file: 'tgt', key: 'k' }), locale)) {
    if (issue.kind === 'extra-category') throw new Error(`bad plural category ${issue.category}`);
  }
}

export type Glossary = { terms: GlossaryTerms };

export function checkGlossary(target: string, glossary: Glossary, locale: string, source?: string): void {
  for (const [term, spec] of Object.entries(glossary.terms)) {
    if (source != null && !source.includes(term)) continue;
    if (spec.doNotTranslate === true) {
      if (source != null && !target.includes(term)) throw new Error(`glossary: "${term}" must stay untranslated`);
      continue;
    }
    const expected = spec[locale];
    if (typeof expected === 'string' && !target.includes(expected)) {
      throw new Error(`glossary term missing: expected "${expected}"`);
    }
  }
}

export async function loadGlossary(cwd: string, path: string | undefined): Promise<Glossary> {
  if (!path) return { terms: {} };
  try {
    const g = JSON.parse(await readFile(resolveInsideProject(cwd, path), 'utf8')) as Partial<Glossary>;
    return { terms: g.terms ?? {} };
  } catch {
    return { terms: {} };
  }
}

export function mergeGlossary(local: Glossary, remote: GlossaryTerms): Glossary {
  // Local file wins for terms defined in both (it is code-reviewed).
  return { terms: { ...remote, ...local.terms } };
}

// ---------- lockfile ----------

export type LockEntry = { source: string; target: string; at?: string; origin?: string };
export type CloudLock = { projectId?: string; cursor?: string; sourceLocale?: string };
export type LockFile = {
  version: number;
  $cloud?: CloudLock;
  [locale: string]: number | CloudLock | Record<string, LockEntry> | undefined;
};

export async function loadLock(cwd: string, path: string): Promise<LockFile> {
  try {
    return JSON.parse(await readFile(resolveInsideProject(cwd, path), 'utf8')) as LockFile;
  } catch {
    return { version: 2 };
  }
}

export async function saveLock(cwd: string, path: string, lock: LockFile): Promise<void> {
  lock.version = 2;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(lock).sort((a, b) => (a === 'version' ? -1 : b === 'version' ? 1 : a.localeCompare(b)))) {
    const v = lock[k];
    if (v && typeof v === 'object' && !k.startsWith('$')) {
      const inner: Record<string, unknown> = {};
      for (const kk of Object.keys(v).sort()) inner[kk] = (v as Record<string, unknown>)[kk];
      sorted[k] = inner;
    } else sorted[k] = v;
  }
  await writeFile(resolveInsideProject(cwd, path), `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

export function lockSection(lock: LockFile, locale: string): Record<string, LockEntry> {
  const v = lock[locale];
  if (v && typeof v === 'object' && !locale.startsWith('$')) return v as Record<string, LockEntry>;
  const fresh: Record<string, LockEntry> = {};
  lock[locale] = fresh;
  return fresh;
}

// ---------- diff ----------

export type KeyMeta = { description?: string; maxLength?: number };

export type PlanItem = { locale: string; key: string; source: string; reason: 'new' | 'changed' | 'missing' | 'forced' };

export type Diff = {
  plan: PlanItem[];
  /** keys present in a target or lock but no longer in the source */
  removed: Record<string, string[]>;
  /** targets edited locally since the lock (human edits — never overwritten) */
  localEdits: Array<{ locale: string; key: string }>;
};

export function diffCatalogs(args: {
  source: Record<string, string>;
  targets: Record<string, Record<string, string>>;
  lock: LockFile;
  locales: string[];
  retranslate?: boolean;
  keyFilter?: (key: string) => boolean;
}): Diff {
  const plan: PlanItem[] = [];
  const removed: Record<string, string[]> = {};
  const localEdits: Diff['localEdits'] = [];
  for (const locale of args.locales) {
    const target = args.targets[locale] ?? {};
    const section = lockSection(args.lock, locale);
    for (const [key, source] of Object.entries(args.source)) {
      if (args.keyFilter && !args.keyFilter(key)) continue;
      const t = target[key];
      const entry = section[key];
      const missing = t == null || t === '';
      const changed = entry != null && entry.source !== sha(source);
      const edited = entry != null && !missing && entry.target !== sha(t);
      if (args.retranslate) {
        plan.push({ locale, key, source, reason: 'forced' });
        continue;
      }
      if (edited && !changed) {
        localEdits.push({ locale, key });
        continue;
      }
      if (missing) plan.push({ locale, key, source, reason: entry ? 'missing' : 'new' });
      else if (changed) plan.push({ locale, key, source, reason: 'changed' });
    }
    const gone = new Set<string>();
    for (const key of [...Object.keys(target), ...Object.keys(section)]) {
      if (!(key in args.source) && (!args.keyFilter || args.keyFilter(key))) gone.add(key);
    }
    if (gone.size) removed[locale] = [...gone].sort();
  }
  return { plan, removed, localEdits };
}

// ---------- translate via API ----------

export type TranslateOutcome = {
  ok: Array<{ locale: string; key: string; source: string; target: string }>;
  failed: Array<{ locale: string; key: string; reason: string }>;
  billedChars: number;
};

/** Persisted progress of an interrupted run (`<lockfile>.run.json`, git-ignore it). */
export type RunState = {
  version: 1;
  projectId: string;
  batches: Record<
    string,
    {
      locale: string;
      keys: string[];
      jobId?: string;
      done?: boolean;
      results?: Job['results'];
      errors?: Job['errors'];
      billedChars?: number;
    }
  >;
};

export function runStatePath(lockPath: string): string {
  return `${lockPath}.run.json`;
}

export async function loadRunState(cwd: string, path: string, projectId: string): Promise<RunState> {
  try {
    const s = JSON.parse(await readFile(resolveInsideProject(cwd, path), 'utf8')) as RunState;
    if (s.version === 1 && s.projectId === projectId && s.batches) return s;
  } catch {
    /* none */
  }
  return { version: 1, projectId, batches: {} };
}

/** Split items into requests capped by key count and source characters. */
export function makeBatches<T extends { source: string }>(items: T[], maxKeys = 100, maxChars = 20_000): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let chars = 0;
  for (const it of items) {
    const c = countChars(it.source);
    if (cur.length && (cur.length >= maxKeys || chars + c > maxChars)) {
      out.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(it);
    chars += c;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Run `fn` over `items` with at most `limit` in flight. */
export async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) await fn(items[i++]!);
  });
  await Promise.all(workers);
}

export async function translateViaCloud(args: {
  client: LoomlocaleClient;
  projectId: string;
  sourceLocale: string;
  plan: PlanItem[];
  glossary: Glossary;
  context?: string;
  meta?: Record<string, KeyMeta>;
  onLocaleStart?: (locale: string, total: number) => void;
  onProgress?: (locale: string, job: Job) => void;
  /** Called after each batch settles with the number of keys it covered. */
  onBatchDone?: (locale: string, keys: number) => void;
  pollIntervalMs?: number;
  /** Locales in flight at once (default 4). */
  concurrency?: number;
  batchSize?: number;
  batchChars?: number;
  /** Resume state; mutated in place and passed to `persist` after every change. */
  state?: RunState;
  persist?: (state: RunState) => Promise<void>;
}): Promise<TranslateOutcome> {
  const out: TranslateOutcome = { ok: [], failed: [], billedChars: 0 };
  const byLocale = new Map<string, PlanItem[]>();
  for (const p of args.plan) {
    const list = byLocale.get(p.locale);
    if (list) list.push(p);
    else byLocale.set(p.locale, [p]);
  }
  const state = args.state;
  let saving = Promise.resolve();
  const persist = () => {
    if (!state || !args.persist) return Promise.resolve();
    saving = saving.then(() => args.persist!(state));
    return saving;
  };
  const glossaryHash = sha(JSON.stringify(args.glossary.terms ?? {}));

  const runBatch = async (locale: string, batch: PlanItem[], attempt: number): Promise<PlanItem[]> => {
    const masks = new Map(batch.map((p) => [p.key, { ...maskIcu(p.source), source: p.source }]));
    const reqItems: TranslateItem[] = batch.map((p) => {
      const m = args.meta?.[p.key];
      return {
        key: p.key,
        text: masks.get(p.key)!.masked,
        ...(m?.description ? { description: m.description } : {}),
        ...(m?.maxLength != null ? { maxLength: m.maxLength } : {}),
      };
    });
    // Deterministic key: re-running the same work (after a crash) dedupes server-side.
    const idempotencyKey = sha(
      JSON.stringify([args.projectId, args.sourceLocale, locale, attempt, args.context ?? '', glossaryHash, reqItems]),
    ).slice(7, 47);
    let rec = state?.batches[idempotencyKey];
    let job: Job | null = null;
    if (rec?.done) {
      job = { id: rec.jobId ?? idempotencyKey, status: 'succeeded', progress: { done: batch.length, total: batch.length }, results: rec.results ?? [], errors: rec.errors ?? [], billedChars: 0 };
    } else {
      if (rec?.jobId) {
        try {
          job = await args.client.waitForJob(rec.jobId, {
            ...(args.pollIntervalMs != null ? { intervalMs: args.pollIntervalMs } : {}),
            onProgress: (j) => args.onProgress?.(locale, j),
          });
        } catch (err) {
          if (!(err instanceof Error && 'status' in err && (err as { status: number }).status === 404)) throw err;
          job = null; // job expired server-side → start again
        }
      }
      if (!job) {
        const started = await args.client.translate(args.projectId, {
          sourceLocale: args.sourceLocale,
          targetLocales: [locale],
          items: reqItems,
          glossary: args.glossary.terms,
          ...(args.context ? { context: args.context } : {}),
          placeholderPattern: '__TONGUE_n__',
          idempotencyKey,
        });
        if (state) {
          rec = state.batches[idempotencyKey] = { locale, keys: batch.map((b) => b.key), jobId: started.id };
          await persist();
        }
        job =
          started.status === 'queued' || started.status === 'running'
            ? await args.client.waitForJob(started.id, {
                ...(args.pollIntervalMs != null ? { intervalMs: args.pollIntervalMs } : {}),
                onProgress: (j) => args.onProgress?.(locale, j),
              })
            : started;
      }
      if (state) {
        state.batches[idempotencyKey] = {
          locale,
          keys: batch.map((b) => b.key),
          jobId: job.id,
          done: true,
          results: job.results ?? [],
          errors: job.errors ?? [],
          billedChars: job.billedChars ?? 0,
        };
        await persist();
      }
    }
    args.onProgress?.(locale, job);
    out.billedChars += job.billedChars ?? 0;
    const retry: PlanItem[] = [];
    const seen = new Set<string>();
    const byKey = new Map(batch.map((p) => [p.key, p]));
    for (const r of job.results ?? []) {
      if (r.locale !== locale) continue;
      const m = masks.get(r.key);
      if (!m || seen.has(r.key)) continue;
      seen.add(r.key);
      const restored = m.restore(r.text.trim());
      let reason: string | null = null;
      if (!restored) reason = 'placeholder tokens lost';
      else {
        try {
          validateParity(m.source, restored, locale);
          checkGlossary(restored, args.glossary, locale, m.source);
          const max = args.meta?.[r.key]?.maxLength;
          if (max != null && [...restored].length > max) throw new Error(`over maxLength ${max}`);
        } catch (err) {
          reason = err instanceof Error ? err.message : String(err);
        }
      }
      if (reason == null) out.ok.push({ locale, key: r.key, source: m.source, target: restored! });
      else if (attempt === 0) retry.push(byKey.get(r.key)!);
      else out.failed.push({ locale, key: r.key, reason });
    }
    for (const e of job.errors ?? []) {
      if (e.locale === locale && !seen.has(e.key) && byKey.has(e.key)) {
        seen.add(e.key);
        out.failed.push({ locale, key: e.key, reason: e.message });
      }
    }
    for (const p of batch) if (!seen.has(p.key)) out.failed.push({ locale, key: p.key, reason: `job ${job.status}: no result` });
    return retry;
  };

  await pool([...byLocale.entries()], args.concurrency ?? 4, async ([locale, items]) => {
    args.onLocaleStart?.(locale, items.length);
    for (const batch of makeBatches(items, args.batchSize, args.batchChars)) {
      const retry = await runBatch(locale, batch, 0);
      if (retry.length) await runBatch(locale, retry, 1);
      args.onBatchDone?.(locale, batch.length);
    }
  });
  await saving;
  return out;
}
