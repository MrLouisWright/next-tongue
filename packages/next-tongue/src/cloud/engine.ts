/**
 * Translation engine around the Loomlocale API: placeholder masking,
 * glossary, ICU/plural parity checks and the tongue.lock hash ledger.
 */
import { createHash, randomUUID } from 'node:crypto';
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
  pollIntervalMs?: number;
}): Promise<TranslateOutcome> {
  const out: TranslateOutcome = { ok: [], failed: [], billedChars: 0 };
  const byLocale = new Map<string, PlanItem[]>();
  for (const p of args.plan) byLocale.set(p.locale, [...(byLocale.get(p.locale) ?? []), p]);

  for (const [locale, items] of byLocale) {
    args.onLocaleStart?.(locale, items.length);
    let pending = items;
    for (let attempt = 0; attempt < 2 && pending.length; attempt++) {
      const masks = new Map(pending.map((p) => [p.key, { ...maskIcu(p.source), source: p.source }]));
      const reqItems: TranslateItem[] = pending.map((p) => {
        const m = args.meta?.[p.key];
        return {
          key: p.key,
          text: masks.get(p.key)!.masked,
          ...(m?.description ? { description: m.description } : {}),
          ...(m?.maxLength != null ? { maxLength: m.maxLength } : {}),
        };
      });
      const started = await args.client.translate(args.projectId, {
        sourceLocale: args.sourceLocale,
        targetLocales: [locale],
        items: reqItems,
        glossary: args.glossary.terms,
        ...(args.context ? { context: args.context } : {}),
        placeholderPattern: '__TONGUE_n__',
        idempotencyKey: randomUUID(),
      });
      const job =
        started.status === 'queued' || started.status === 'running'
          ? await args.client.waitForJob(started.id, {
              ...(args.pollIntervalMs != null ? { intervalMs: args.pollIntervalMs } : {}),
              onProgress: (j) => args.onProgress?.(locale, j),
            })
          : started;
      args.onProgress?.(locale, job);
      out.billedChars += job.billedChars ?? 0;
      const retry: PlanItem[] = [];
      const seen = new Set<string>();
      for (const r of job.results ?? []) {
        if (r.locale !== locale) continue;
        const m = masks.get(r.key);
        if (!m) continue;
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
        const item = pending.find((p) => p.key === r.key)!;
        if (reason == null) out.ok.push({ locale, key: r.key, source: m.source, target: restored! });
        else if (attempt === 0) retry.push(item);
        else out.failed.push({ locale, key: r.key, reason });
      }
      for (const e of job.errors ?? []) {
        if (e.locale === locale && !seen.has(e.key)) {
          seen.add(e.key);
          out.failed.push({ locale, key: e.key, reason: e.message });
        }
      }
      for (const p of pending) if (!seen.has(p.key)) out.failed.push({ locale, key: p.key, reason: `job ${job.status}: no result` });
      pending = retry;
    }
  }
  return out;
}
