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
import { ApiError, DEFAULT_TRANSLATE_LIMITS, JobTimeoutError, jobErrorMessage } from './api.js';
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

/**
 * Polls all active jobs together: one round of concurrent `GET /jobs/:id` immediately when the first
 * job is registered, then every `intervalMs` (default 1 s). Per-job overall and stall timeouts as in
 * `waitForJob`. A 404 or other error rejects only that job's waiter.
 */
export class JobPoller {
  private readonly waiting = new Map<string, Array<{ onJob: (j: Job) => void; resolve: (j: Job) => void; reject: (e: unknown) => void }>>();
  private readonly seen = new Map<string, { start: number; sig: string; changed: number }>();
  private running = false;
  constructor(
    private readonly client: Pick<LoomlocaleClient, 'job'>,
    private readonly opts: { intervalMs?: number; timeoutMs?: number; stallTimeoutMs?: number; onRound?: () => void; now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
  ) {}

  wait(id: string, onJob: (j: Job) => void = () => {}): Promise<Job> {
    return new Promise<Job>((resolve, reject) => {
      const list = this.waiting.get(id) ?? [];
      list.push({ onJob, resolve, reject });
      this.waiting.set(id, list);
      if (!this.running) {
        // Defer one macrotask so jobs registered together share the first (immediate) round.
        this.running = true;
        setImmediate(() => void this.loop());
      }
    });
  }

  private async loop(): Promise<void> {
    this.running = true;
    const now = this.opts.now ?? Date.now;
    const sleep = this.opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const timeout = this.opts.timeoutMs ?? 30 * 60_000;
    const stall = this.opts.stallTimeoutMs ?? 10 * 60_000;
    try {
      while (this.waiting.size) {
        const ids = [...this.waiting.keys()];
        await Promise.all(
          ids.map(async (id) => {
            const settle = (fn: (w: { resolve: (j: Job) => void; reject: (e: unknown) => void }) => void) => {
              const ws = this.waiting.get(id) ?? [];
              this.waiting.delete(id);
              this.seen.delete(id);
              for (const w of ws) fn(w);
            };
            let job: Job;
            try {
              job = await this.client.job(id);
            } catch (err) {
              settle((w) => w.reject(err));
              return;
            }
            const t = now();
            for (const w of this.waiting.get(id) ?? []) w.onJob(job);
            if (job.status !== 'queued' && job.status !== 'running') return settle((w) => w.resolve(job));
            const sig = `${job.status}:${job.progress?.done ?? 0}`;
            const s = this.seen.get(id) ?? { start: t, sig, changed: t };
            if (s.sig !== sig) {
              s.sig = sig;
              s.changed = t;
            }
            this.seen.set(id, s);
            if (t - s.start >= timeout) return settle((w) => w.reject(new JobTimeoutError(id, job.status, t - s.start, 'timeout')));
            if (t - s.changed >= stall) return settle((w) => w.reject(new JobTimeoutError(id, job.status, t - s.start, 'stalled')));
          }),
        );
        this.opts.onRound?.();
        if (this.waiting.size) await sleep(this.opts.intervalMs ?? 1000);
      }
    } finally {
      this.running = false;
    }
  }
}

/**
 * Overall progress across all of a run's jobs. done = Σ progress.done of every job on every poll
 * (whatever its status) + keys finished by an interrupted run; total = Σ progress.total, falling back
 * to the batch size for jobs that report none, plus items not yet submitted.
 */
export class RunProgress {
  private readonly slots = new Map<string, { locale: string; done: number; total: number; status: string; error: string | null }>();
  private readonly items = new Map<string, number>();
  private readonly resumed = new Map<string, number>();
  constructor(readonly locales: string[], plan: Array<{ locale: string }>, resumedKeys: Iterable<string> = []) {
    for (const l of locales) this.items.set(l, 0);
    for (const p of plan) this.items.set(p.locale, (this.items.get(p.locale) ?? 0) + 1);
    for (const k of resumedKeys) {
      const l = k.split('\0')[0]!;
      this.resumed.set(l, (this.resumed.get(l) ?? 0) + 1);
    }
  }
  update(locale: string, job: Job, info: { slot: string; batchSize: number }): void {
    const total = job.progress?.total && job.progress.total > 0 ? job.progress.total : info.batchSize;
    const finished = job.status === 'succeeded' || job.status === 'partial';
    const done = Math.min(total, finished ? total : Math.max(0, job.progress?.done ?? 0));
    this.slots.set(info.slot, { locale, done, total, status: job.status, error: job.status === 'failed' ? jobErrorMessage(job) : null });
  }
  locale(l: string): { done: number; total: number; status: string; error: string | null; batchSize: number } {
    let done = this.resumed.get(l) ?? 0;
    let total = done;
    let started = 0;
    let status = 'queued';
    let error: string | null = null;
    let any = false;
    let allFinal = true;
    for (const s of this.slots.values()) {
      if (s.locale !== l) continue;
      any = true;
      done += s.done;
      total += s.total;
      started += s.total;
      if (s.status === 'failed') {
        status = 'failed';
        error ??= s.error;
      } else if (status !== 'failed' && s.status === 'running') status = 'running';
      if (s.status === 'queued' || s.status === 'running') allFinal = false;
    }
    const items = this.items.get(l) ?? 0;
    const unstarted = Math.max(0, items - (this.resumed.get(l) ?? 0) - started);
    total += unstarted;
    if (status !== 'failed' && any && allFinal && unstarted === 0) status = 'done';
    if (!any && done > 0 && unstarted === 0) status = 'done';
    return { done, total, status, error, batchSize: items };
  }
  overall(): { done: number; total: number } {
    let done = 0;
    let total = 0;
    for (const l of this.locales) {
      const x = this.locale(l);
      done += x.done;
      total += x.total;
    }
    return { done, total };
  }
  /** `de 556/599 · fr failed: …`, failed languages first so truncation keeps them visible. */
  segments(): string[] {
    const segs = this.locales.map((l) => {
      const x = this.locale(l);
      const text = x.status === 'failed' ? `${l} failed${x.error ? `: ${x.error}` : ''} ${x.done}/${x.total}` : `${l}${x.status === 'queued' && x.done === 0 ? ' queued' : ''} ${x.done}/${x.total}`;
      return { failed: x.status === 'failed', text };
    });
    return [...segs.filter((s) => s.failed), ...segs.filter((s) => !s.failed)].map((s) => s.text);
  }
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
  /** Every poll of every job (and the job returned by translate). `slot` identifies the batch; retries (attempt 1) are not reported. */
  onProgress?: (locale: string, job: Job, info: { slot: string; batchSize: number }) => void;
  /** After each round of polling all active jobs together. */
  onPollRound?: () => void;
  /** Called after each batch settles with the number of keys it covered. */
  onBatchDone?: (locale: string, keys: number, info?: { resumed: boolean }) => void;
  pollIntervalMs?: number;
  /** Overall per-job polling limit (default 30 min). */
  jobTimeoutMs?: number;
  /** Give up on a job whose status/progress has not changed for this long (default 10 min). */
  jobStallTimeoutMs?: number;
  /** Called before polling a job recorded by an interrupted run. */
  onResumeJob?: (locale: string, jobId: string) => void;
  /** Locales in flight at once (default: all). */
  concurrency?: number;
  batchSize?: number;
  batchChars?: number;
  /** Server limits (from /me `limits`); batch caps are clamped to these. */
  limits?: { maxItems: number; maxSourceChars: number };
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

  const poller = new JobPoller(args.client, {
    ...(args.pollIntervalMs != null ? { intervalMs: args.pollIntervalMs } : {}),
    ...(args.jobTimeoutMs != null ? { timeoutMs: args.jobTimeoutMs } : {}),
    ...(args.jobStallTimeoutMs != null ? { stallTimeoutMs: args.jobStallTimeoutMs } : {}),
    ...(args.onPollRound ? { onRound: args.onPollRound } : {}),
  });
  const resumedBatches = new Set<string>();

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
    const report = (j: Job) => {
      if (attempt === 0) args.onProgress?.(locale, j, { slot: idempotencyKey, batchSize: batch.length });
    };
    let rec = state?.batches[idempotencyKey];
    let job: Job | null = null;
    if (rec?.done) {
      if (attempt === 0) resumedBatches.add(batch.map((b) => b.key).join('\0'));
      job = { id: rec.jobId ?? idempotencyKey, status: 'succeeded', progress: { done: batch.length, total: batch.length }, results: rec.results ?? [], errors: rec.errors ?? [], billedChars: 0 };
    } else {
      if (rec?.jobId) {
        try {
          args.onResumeJob?.(locale, rec.jobId);
          job = await poller.wait(rec.jobId, (j) => report(j));
        } catch (err) {
          if (!(err instanceof Error && 'status' in err && (err as { status: number }).status === 404)) throw err;
          job = null; // job expired server-side → start again
        }
      }
      if (!job) {
        let started: Job;
        try {
          started = await args.client.translate(args.projectId, {
          sourceLocale: args.sourceLocale,
          targetLocales: [locale],
          items: reqItems,
          glossary: args.glossary.terms,
          ...(args.context ? { context: args.context } : {}),
          placeholderPattern: '__TONGUE_n__',
          idempotencyKey,
        });
        } catch (err) {
          // 413 payload_too_large: split the batch in half and retry each half.
          if (err instanceof ApiError && err.status === 413 && batch.length > 1) {
            const mid = Math.ceil(batch.length / 2);
            const a = await runBatch(locale, batch.slice(0, mid), attempt);
            const b = await runBatch(locale, batch.slice(mid), attempt);
            return [...a, ...b];
          }
          if (err instanceof ApiError && err.status === 413) {
            out.failed.push({ locale, key: batch[0]!.key, reason: 'too large for one request (413 payload_too_large)' });
            return [];
          }
          throw err;
        }
        if (state) {
          rec = state.batches[idempotencyKey] = { locale, keys: batch.map((b) => b.key), jobId: started.id };
          await persist();
        }
        report(started);
        job = started.status === 'queued' || started.status === 'running' ? await poller.wait(started.id, (j) => report(j)) : started;
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
    if (!rec?.done || !resumedBatches.has(batch.map((b) => b.key).join('\0'))) report(job);
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
    const serverReason = jobErrorMessage(job);
    for (const p of batch) if (!seen.has(p.key)) out.failed.push({ locale, key: p.key, reason: `job ${job.status}${serverReason ? `: ${serverReason}` : ': no result'}` });
    return retry;
  };

  // Jobs for all languages are created in parallel by default (the server queues/limits them; 429s back off).
  await pool([...byLocale.entries()], args.concurrency ?? byLocale.size, async ([locale, items]) => {
    args.onLocaleStart?.(locale, items.length);
    const maxItems = Math.min(args.batchSize ?? Infinity, args.limits?.maxItems ?? DEFAULT_TRANSLATE_LIMITS.maxItems);
    const maxChars = Math.min(args.batchChars ?? Infinity, args.limits?.maxSourceChars ?? DEFAULT_TRANSLATE_LIMITS.maxSourceChars);
    for (const batch of makeBatches(items, maxItems, maxChars)) {
      const retry = await runBatch(locale, batch, 0);
      if (retry.length) await runBatch(locale, retry, 1);
      args.onBatchDone?.(locale, batch.length, { resumed: resumedBatches.has(batch.map((b) => b.key).join('\0')) });
    }
  });
  await saving;
  return out;
}
