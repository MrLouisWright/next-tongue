/**
 * `tongue update` — incremental sync with Loomlocale:
 * pull web edits + glossary → hash diff vs tongue.lock → translate only
 * new/changed keys → drop deleted keys → push results.
 */
import { readFile } from 'node:fs/promises';
import { TongueError } from '../errors.js';
import { ApiError, JobTimeoutError, aggregateEstimates, jobErrorMessage, creditExpiry, creditExpiryWarning, localCostGBP, lowCreditHint, translateLimits, type Estimate, type Me, type SyncEntry } from '../cloud/api.js';
import { flatten, readCatalog, writeCatalog, type Catalog, type Flat } from '../cloud/dictionaries.js';
import {
  countChars,
  diffCatalogs,
  loadGlossary,
  loadLock,
  loadRunState,
  lockSection,
  runStatePath,
  mergeGlossary,
  saveLock,
  sha,
  RunProgress,
  translateViaCloud,
  type KeyMeta,
  type PlanItem,
} from '../cloud/engine.js';
import { formatGBP, loadProject, makeClient, type CloudGlobals, type ProjectContext } from '../cloud/project.js';
import { color, createPrompter, type Prompter, type Progress } from '../cloud/tui.js';
import { enforceBudget, hasBudget, resolveBudget } from '../cloud/budget.js';
import { buildChanges, changesMarkdown, renderChanges, startReviewBranch, summarizeChanges, type KeyChange } from './review.js';
import { resolveInsideProject } from './safe-path.js';

export type UpdateOptions = CloudGlobals & {
  dryRun?: boolean;
  ci?: boolean;
  yes?: boolean;
  locale?: string;
  keys?: string;
  retranslate?: boolean;
  /** Skip pull/push (plain `tongue translate`). */
  noSync?: boolean;
  prefer?: 'local' | 'remote';
  /** Write `<locale>.review.json` instead of touching dictionaries. */
  review?: boolean;
  maxChars?: number;
  /** Per-run cost cap in GBP (`--max-cost`). */
  maxCost?: number;
  /** Locales translated in parallel (`--concurrency`). */
  concurrency?: number;
  /** `pr`: commit changes to a new branch and open a pull request instead of writing to the working tree. */
  reviewMode?: 'pr';
  /** Stage dictionaries + lock under this directory instead of overwriting them. */
  outDir?: string;
  prompter?: Prompter;
};

export type UpdateSummary = {
  translated: number;
  failed: Array<{ locale: string; key: string; reason: string }>;
  removed: number;
  pulled: number;
  conflicts: number;
  billedChars: number;
  plannedChars: number;
  plan: PlanItem[];
  files: string[];
  changes: KeyChange[];
  /** True when the run was resumed from a previous interrupted run. */
  resumed: boolean;
  pr?: { url: string | null; branch: string; commit: string | null };
};

/** key → source dictionary path (sent as `file` on sync so the web app keeps keys in the right file). */
export function sourceFileIndex(source: Catalog): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of source.files) for (const k of Object.keys(flatten(f.shape.data, f.keyPrefix))) if (!out.has(k)) out.set(k, f.rel.replace(/^\.\//, ''));
  return out;
}

export function matchKeyPattern(fullKey: string, pattern: string | undefined): boolean {
  if (!pattern) return true;
  return pattern
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((p) => {
      if (p.endsWith('.*')) return fullKey.startsWith(p.slice(0, -1));
      if (p.includes('*')) return new RegExp('^' + p.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$').test(fullKey);
      return fullKey === p;
    });
}

async function loadMeta(ctx: ProjectContext, source: Catalog): Promise<Record<string, KeyMeta>> {
  const out: Record<string, KeyMeta> = {};
  const walk = (node: Record<string, unknown>, prefix: string) => {
    for (const [k, v] of Object.entries(node)) {
      const m = /^(.*)\$(description|meta)$/.exec(k);
      if (m) {
        const full = prefix ? (m[1] ? `${prefix}.${m[1]}` : prefix) : m[1]!;
        const e: KeyMeta = { ...out[full] };
        if (typeof v === 'string') e.description = v;
        else if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>;
          if (typeof o.description === 'string') e.description = o.description;
          if (typeof o.maxLength === 'number') e.maxLength = o.maxLength;
        }
        out[full] = e;
      } else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v as Record<string, unknown>, prefix ? `${prefix}.${k}` : k);
    }
  };
  for (const f of source.files) walk(f.shape.data, f.keyPrefix);
  void ctx;
  return out;
}

export async function runUpdate(opts: UpdateOptions): Promise<UpdateSummary> {
  const env = opts.env ?? process.env;
  const ci = opts.ci === true || env.CI === 'true';
  const log = (...a: unknown[]) => {
    if (!opts.quiet && !opts.json) console.log(...a);
  };
  const ctx = await loadProject(opts);
  const locales = opts.locale
    ? opts.locale.split(',').map((s) => s.trim()).filter(Boolean)
    : ctx.targetLocales;
  for (const l of locales) {
    if (!ctx.config.locales.includes(l) || l === ctx.sourceLocale) throw new TongueError('TONGUE_E_CONFIG', `Unknown target locale: ${l}`);
  }
  const source = await readCatalog(ctx.cwd, ctx.patterns, ctx.sourceLocale);
  if (!Object.keys(source.flat).length) {
    throw new TongueError('TONGUE_E_CONFIG', `No source strings found for ${ctx.sourceLocale} in ${ctx.patterns.join(', ')}`);
  }
  const targets: Record<string, Flat> = {};
  for (const l of locales) targets[l] = (await readCatalog(ctx.cwd, ctx.patterns, l)).flat;
  const lock = await loadLock(ctx.cwd, ctx.lockPath);
  let glossary = await loadGlossary(ctx.cwd, ctx.config.translate?.glossary);
  const meta = await loadMeta(ctx, source);
  const keyFilter = opts.keys ? (k: string) => matchKeyPattern(k, opts.keys) : undefined;
  const summary: UpdateSummary = { translated: 0, failed: [], removed: 0, pulled: 0, conflicts: 0, billedChars: 0, plannedChars: 0, plan: [], files: [], changes: [], resumed: false };
  const pending: Record<string, { set: Flat; remove: string[] }> = {};
  const bucket = (l: string) => (pending[l] ??= { set: {}, remove: [] });

  const projectId = ctx.config.cloud.projectId;
  const sync = !opts.noSync && !opts.dryRun;
  if (sync && !projectId) {
    throw new TongueError('TONGUE_E_CONFIG', 'No Loomlocale project linked. Run `tongue link` (writes cloud.projectId to your config).');
  }
  const needClient = !opts.dryRun;
  const client = needClient ? await makeClient(opts, ctx.config) : null;

  // 1. pull web edits + glossary
  const takenFromRemote = new Set<string>();
  if (sync && client && projectId) {
    const pulled = await client.sync(projectId, {
      mode: 'pull',
      sourceLocale: ctx.sourceLocale,
      ...(lock.$cloud?.cursor ? { cursor: lock.$cloud.cursor } : {}),
    });
    glossary = mergeGlossary(glossary, pulled.glossary);
    lock.$cloud = { ...lock.$cloud, projectId, cursor: pulled.cursor, sourceLocale: ctx.sourceLocale };
    const prompter = opts.prompter ?? (ci || opts.yes ? null : createPrompter());
    for (const e of pulled.entries) {
      if (!locales.includes(e.locale)) continue;
      const src = source.flat[e.key];
      if (src == null || e.sourceHash !== sha(src)) continue; // stale web edit → retranslate path
      const local = targets[e.locale]?.[e.key];
      if (local === e.text) continue;
      const entry = lockSection(lock, e.locale)[e.key];
      const localEdited = local != null && local !== '' && entry != null && entry.target !== sha(local);
      let take = true;
      if (localEdited) {
        summary.conflicts++;
        const prefer = opts.prefer ?? (ci ? undefined : prompter ? await prompter.select(`Conflict ${e.locale} ${e.key}\n  local:  ${local}\n  remote: ${e.text}`, [
          { value: 'remote' as const, label: 'Use web (Loomlocale) version' },
          { value: 'local' as const, label: 'Keep local file version' },
        ]) : undefined);
        if (!prefer) {
          throw new TongueError('TONGUE_E_CONFIG', `Conflict on ${e.locale}:${e.key} (edited locally and on loomlocale.com). Re-run with --prefer local|remote.`);
        }
        take = prefer === 'remote';
      }
      if (!take) continue;
      bucket(e.locale).set[e.key] = e.text;
      targets[e.locale]![e.key] = e.text;
      lockSection(lock, e.locale)[e.key] = { source: e.sourceHash, target: sha(e.text), at: e.updatedAt ?? new Date().toISOString(), origin: e.origin ?? 'web' };
      takenFromRemote.add(`${e.locale}\0${e.key}`);
      summary.pulled++;
    }
  }

  // 2. diff
  const diff = diffCatalogs({ source: source.flat, targets, lock, locales, ...(opts.retranslate ? { retranslate: true } : {}), ...(keyFilter ? { keyFilter } : {}) });
  const plan = diff.plan.filter((p) => !takenFromRemote.has(`${p.locale}\0${p.key}`));
  summary.plan = plan;
  summary.plannedChars = plan.reduce((n, p) => n + countChars(p.source), 0);

  const budget = resolveBudget(ctx.config, { ...(opts.maxChars != null ? { maxChars: opts.maxChars } : {}), ...(opts.maxCost != null ? { maxCost: opts.maxCost } : {}) }, env);
  const localCost = localCostGBP(summary.plannedChars);

  if (opts.dryRun) {
    if (opts.json) console.log(JSON.stringify({ plan, removed: diff.removed, localEdits: diff.localEdits, chars: summary.plannedChars, costGBP: localCost, budget }));
    else {
      log(`tongue update: dry-run — ${plan.length} key(s) to translate (${summary.plannedChars.toLocaleString('en-GB')} chars, ~${formatGBP(localCost)} PAYG)`);
      for (const p of plan) log(`  + ${p.locale} ${p.key} ${color.dim(`(${p.reason})`)}`);
      for (const [l, keys] of Object.entries(diff.removed)) for (const k of keys) log(`  - ${l} ${k} ${color.dim('(deleted in source)')}`);
      for (const e of diff.localEdits) log(`  ~ ${e.locale} ${e.key} ${color.dim('(local edit kept)')}`);
    }
    // Local estimate only (no network): monthly caps need the API and are skipped here.
    enforceBudget(budget, { chars: summary.plannedChars, billableChars: summary.plannedChars, costGBP: localCost });
    return summary;
  }

  // GET /me is fetched at most once (limits, monthly spend); failures fall back to defaults.
  let lastEstimate: Estimate | null = null;
  let runEstimate: ReturnType<typeof aggregateEstimates> | null = null;
  let mePromise: Promise<Me | null> | null = null;
  const getMe = () => (mePromise ??= client ? client.me().catch(() => null) : Promise.resolve(null));

  if (plan.length && client && projectId && hasBudget(budget)) {
    const byLocale = new Map<string, PlanItem[]>();
    for (const p of plan) byLocale.set(p.locale, [...(byLocale.get(p.locale) ?? []), p]);
    const ests = await Promise.all(
      [...byLocale].map(([l, items]) => client.estimate(projectId, { sourceLocale: ctx.sourceLocale, targetLocales: [l], items: items.map((p) => ({ key: p.key, text: p.source })) })),
    );
    const est = aggregateEstimates(ests);
    runEstimate = est;
    lastEstimate = ests.find((e) => creditExpiry(e)) ?? null;
    if (typeof est.creditBalanceGBP === 'number' && !opts.quiet && !opts.json)
      log(color.dim(`  prepaid credit balance: ${formatGBP(est.creditBalanceGBP)} (this run ~${formatGBP(est.creditRequiredGBP ?? est.costGBP)})`));
    const plan2 = budget.monthlyChars != null || budget.monthlyCostGBP != null ? (await getMe())?.plan : undefined;
    enforceBudget(budget, est, plan2);
  }

  // 3. translate
  if (plan.length && client) {
    if (!projectId) throw new TongueError('TONGUE_E_CONFIG', 'No Loomlocale project linked. Run `tongue link`.');
    const statePath = runStatePath(ctx.lockPath);
    const state = await loadRunState(ctx.cwd, statePath, projectId);
    summary.resumed = Object.keys(state.batches).length > 0;
    // Keys already finished by the interrupted run count towards progress straight away.
    const planned = new Set(plan.map((p) => `${p.locale}\0${p.key}`));
    const recs = Object.values(state.batches);
    const doneKeys = new Set<string>();
    for (const b of recs) if (b.done) for (const k of b.keys) if (planned.has(`${b.locale}\0${k}`)) doneKeys.add(`${b.locale}\0${k}`);
    const pendingJobs = recs.filter((b) => !b.done && b.jobId).length;
    if (summary.resumed)
      log(
        color.dim(
          `  resuming interrupted run (${recs.length} batch(es) recorded in ${statePath}: ${doneKeys.size}/${plan.length} key(s) already done${pendingJobs ? `, ${pendingJobs} job(s) to check` : ''})`,
        ),
      );
    const { writeFile: wf } = await import('node:fs/promises');
    const concurrency = opts.concurrency ?? ctx.config.cloud.concurrency;
    const runLocales = locales.filter((l) => plan.some((p) => p.locale === l));
    const progress = new RunProgress(runLocales, plan, doneKeys);
    const label = runLocales.length > 3 ? `${ctx.sourceLocale} → ${runLocales.length} languages` : `${ctx.sourceLocale} → ${runLocales.join(', ')}`;
    let bar: Progress | null = opts.quiet || opts.json ? null : (opts.prompter ?? createPrompter([])).progress(label, plan.length);
    let shownDone = 0;
    const redraw = () => {
      if (!bar) return;
      const o = progress.overall();
      if (bar.set) bar.set(o.done, o.total, progress.segments());
      else if (o.done > shownDone) bar.tick(o.done - shownDone, progress.segments().join(' · '));
      shownDone = Math.max(shownDone, o.done);
    };
    redraw(); // 0/total (or resumed/total) straight away
    const me = await getMe();
    const expiryWarn = creditExpiryWarning(me) ?? creditExpiryWarning(lastEstimate);
    if (expiryWarn && !opts.json) console.error(color.yellow(expiryWarn));
    // Only warn about low credit when this run actually needs credit (not when the allowance covers it).
    const low = lowCreditHint(me, runEstimate ?? { chars: summary.plannedChars });
    if (low && !opts.json) console.error(color.yellow(low));
    const limits = translateLimits(me);
    const result = await translateViaCloud({
      ...(concurrency != null ? { concurrency } : {}),
      limits,
      ...(ctx.config.cloud.batchSize != null ? { batchSize: ctx.config.cloud.batchSize } : {}),
      ...(ctx.config.cloud.batchChars != null ? { batchChars: ctx.config.cloud.batchChars } : {}),
      state,
      persist: (st) => wf(resolveInsideProject(ctx.cwd, statePath), `${JSON.stringify(st)}\n`, 'utf8'),
      onPollRound: redraw,
      onResumeJob: (l, id) => {
        if (!bar) log(color.dim(`  checking recorded job ${id} (${l})`));
      },
      ...jobTimeouts(opts, env),
      client,
      projectId,
      sourceLocale: ctx.sourceLocale,
      plan,
      glossary,
      ...(ctx.config.translate?.context ? { context: ctx.config.translate.context } : {}),
      meta,
      ...(opts.pollIntervalMs != null ? { pollIntervalMs: opts.pollIntervalMs } : {}),
      onProgress: (l, job, info) => {
        progress.update(l, job, info);
        if (job.status !== 'queued' && job.status !== 'running') redraw();
        const reason = job.status === 'failed' ? jobErrorMessage(job) : null;
        if (job.status === 'failed' && !opts.json) console.error(color.red(`  Loomlocale job ${job.id} (${l}) failed${reason ? `: ${reason}` : ''}`));
      },
    })
      .catch((err: unknown) => {
        bar?.done(color.yellow('translation interrupted'));
        bar = null;
        throw err;
      })
      .catch(mapSpendCap);
    (bar as Progress | null)?.done();
    bar = null;
    summary.billedChars = result.billedChars;
    summary.failed = result.failed;
    for (const r of result.ok) {
      bucket(r.locale).set[r.key] = r.target;
      lockSection(lock, r.locale)[r.key] = { source: sha(r.source), target: sha(r.target), at: new Date().toISOString(), origin: 'machine' };
      summary.translated++;
    }
  }

  // 4. deletions
  for (const [l, keys] of Object.entries(diff.removed)) {
    const section = lockSection(lock, l);
    for (const k of keys) {
      delete section[k];
      if (targets[l]?.[k] != null) {
        bucket(l).remove.push(k);
        summary.removed++;
      }
    }
  }

  // 5. review + write
  const changes = buildChanges(pending, targets);
  summary.changes = changes;
  const statePath = runStatePath(ctx.lockPath);
  const clearState = async () => {
    const { rm } = await import('node:fs/promises');
    await rm(resolveInsideProject(ctx.cwd, statePath), { force: true });
  };
  if (opts.review) {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    for (const [l, b] of Object.entries(pending)) {
      if (!Object.keys(b.set).length) continue;
      const rel = ctx.patterns[0]!.replaceAll('{locale}', l).replace(/\*?\.(json|ts|mts|js|mjs)$/, '').replace(/\/$/, '') + '.review.json';
      const abs = resolveInsideProject(ctx.cwd, rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, `${JSON.stringify(b.set, null, 2)}\n`, 'utf8');
      summary.files.push(rel);
    }
    await clearState();
    log(`tongue update: wrote ${summary.files.length} review file(s); run \`tongue translate --accept\` after review`);
    return summary;
  }
  if (changes.length && !opts.json && !opts.quiet) console.log(renderChanges(changes));
  const interactive = !ci && !opts.yes && (opts.prompter != null || (process.stdin.isTTY === true && process.stdout.isTTY === true));
  if (changes.length && interactive && !opts.json) {
    const target = opts.reviewMode === 'pr' ? 'open a review PR' : opts.outDir ? `stage in ${opts.outDir}` : 'write';
    const ok = await (opts.prompter ?? createPrompter()).confirm(`Apply these changes (${target})?`, true);
    if (!ok) {
      // Keep the run state: re-running reuses these translations without billing again.
      log(color.yellow('Nothing written. Re-run `tongue update` to review again (finished translations are reused, not re-billed).'));
      process.exitCode = 1;
      return summary;
    }
  }
  const staged = opts.outDir != null || opts.reviewMode === 'pr';
  const review = opts.reviewMode === 'pr' && changes.length ? startReviewBranch({ cwd: ctx.cwd, env, ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}), log: (m) => log(m) }) : null;
  try {
    for (const [l, b] of Object.entries(pending)) {
      summary.files.push(
        ...(await writeCatalog({ cwd: ctx.cwd, source, sourceLocale: ctx.sourceLocale, locale: l, set: b.set, remove: b.remove, ...(opts.outDir ? { outDir: opts.outDir } : {}) })),
      );
    }
    if (opts.outDir) {
      const { mkdir } = await import('node:fs/promises');
      const { dirname } = await import('node:path');
      const lockOut = `${opts.outDir.replace(/\/+$/, '')}/${ctx.lockPath.replace(/^\.\//, '')}`;
      await mkdir(dirname(resolveInsideProject(ctx.cwd, lockOut)), { recursive: true });
      await saveLock(ctx.cwd, lockOut, lock);
      log(`tongue update: staged ${summary.files.length} file(s) + lock in ${opts.outDir} (dictionaries untouched)`);
    }
    if (review) {
      await saveLock(ctx.cwd, ctx.lockPath, lock);
      const s2 = summarizeChanges(changes);
      summary.pr = await review.finish(
        [...summary.files, ctx.lockPath],
        `i18n: Loomlocale translations (${s2.added} added, ${s2.changed} changed, ${s2.removed} removed)`,
        changesMarkdown(changes),
      );
      log(summary.pr.url ? `${color.green('✔')} review PR: ${summary.pr.url}` : `review branch: ${summary.pr.branch}`);
    }
  } catch (err) {
    review?.abort();
    throw err;
  }
  if (staged) {
    await clearState();
    if (opts.json) console.log(JSON.stringify({ ...summary, plan: undefined, planned: plan.length }));
    if (summary.failed.length) process.exitCode = 1;
    return summary;
  }

  // 6. push
  if (sync && client && projectId) {
    const entries: SyncEntry[] = [];
    const fileOf = sourceFileIndex(source);
    for (const [k, v] of Object.entries(source.flat)) {
      const file = fileOf.get(k);
      entries.push({ key: k, locale: ctx.sourceLocale, text: v, sourceHash: sha(v), origin: 'cli', ...(file ? { file } : {}) });
    }
    for (const [l, b] of Object.entries(pending)) {
      for (const [k, v] of Object.entries(b.set)) {
        if (takenFromRemote.has(`${l}\0${k}`)) continue;
        entries.push({ key: k, locale: l, text: v, sourceHash: sha(source.flat[k] ?? ''), origin: 'machine' });
      }
    }
    for (const e of diff.localEdits) {
      const t = targets[e.locale]?.[e.key];
      if (t != null) entries.push({ key: e.key, locale: e.locale, text: t, sourceHash: sha(source.flat[e.key] ?? ''), origin: 'cli' });
    }
    const deletedKeys = [...new Set(Object.values(diff.removed).flat())];
    const pushed = await client.sync(projectId, {
      mode: 'push',
      sourceLocale: ctx.sourceLocale,
      ...(lock.$cloud?.cursor ? { cursor: lock.$cloud.cursor } : {}),
      entries,
      deletedKeys,
    });
    lock.$cloud = { ...lock.$cloud, projectId, cursor: pushed.cursor, sourceLocale: ctx.sourceLocale };
  }
  await saveLock(ctx.cwd, ctx.lockPath, lock);
  await clearState();

  if (opts.json) console.log(JSON.stringify({ ...summary, plan: undefined, planned: plan.length }));
  else {
    log(
      `${color.green('✔')} tongue update: ${summary.translated} translated, ${summary.pulled} pulled from web, ${summary.removed} removed, ${summary.failed.length} failed` +
        (summary.billedChars ? color.dim(` · ${summary.billedChars.toLocaleString('en-GB')} chars billed`) : ''),
    );
    for (const f of summary.failed) console.error(`  ${color.red('✗')} ${f.locale} ${f.key}: ${f.reason}`);
  }
  if (summary.failed.length) process.exitCode = 1;
  return summary;
}

/** Apply `<locale>.review.json` files written by `--review`. */
export async function acceptReviews(opts: CloudGlobals): Promise<number> {
  const ctx = await loadProject(opts);
  const source = await readCatalog(ctx.cwd, ctx.patterns, ctx.sourceLocale);
  const lock = await loadLock(ctx.cwd, ctx.lockPath);
  const { rm } = await import('node:fs/promises');
  let n = 0;
  for (const l of ctx.targetLocales) {
    const rel = ctx.patterns[0]!.replaceAll('{locale}', l).replace(/\*?\.(json|ts|mts|js|mjs)$/, '').replace(/\/$/, '') + '.review.json';
    let reviews: Flat;
    try {
      reviews = JSON.parse(await readFile(resolveInsideProject(ctx.cwd, rel), 'utf8')) as Flat;
    } catch {
      continue;
    }
    await writeCatalog({ cwd: ctx.cwd, source, sourceLocale: ctx.sourceLocale, locale: l, set: reviews, remove: [] });
    const section = lockSection(lock, l);
    for (const [k, v] of Object.entries(reviews)) {
      section[k] = { source: sha(source.flat[k] ?? ''), target: sha(v), at: new Date().toISOString(), origin: 'machine' };
      n++;
    }
    await rm(resolveInsideProject(ctx.cwd, rel), { force: true });
    if (!opts.quiet) console.log(`tongue translate: accepted ${rel}`);
  }
  await saveLock(ctx.cwd, ctx.lockPath, lock);
  return n;
}

/** Job polling limits from options or `LOOMLOCALE_JOB_TIMEOUT` / `LOOMLOCALE_JOB_STALL_TIMEOUT` (seconds). */
function jobTimeouts(opts: UpdateOptions, env: NodeJS.ProcessEnv): { jobTimeoutMs?: number; jobStallTimeoutMs?: number } {
  const sec = (v: string | undefined) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) * 1000 : undefined);
  const t = opts.jobTimeoutMs ?? sec(env.LOOMLOCALE_JOB_TIMEOUT);
  const st = opts.jobStallTimeoutMs ?? sec(env.LOOMLOCALE_JOB_STALL_TIMEOUT);
  return { ...(t != null ? { jobTimeoutMs: t } : {}), ...(st != null ? { jobStallTimeoutMs: st } : {}) };
}

/** `402 spend_cap_reached` now only means a job's own `maxCostGBP` was exceeded: report it as a budget error. */
function mapSpendCap(err: unknown): never {
  if (err instanceof JobTimeoutError) {
    throw new TongueError(
      'TONGUE_E_JOB_TIMEOUT',
      `${err.message} Finished batches are saved in the run state, so re-running \`tongue update\` resumes where this stopped. If the job stays ${err.lastStatus}, check https://www.loomlocale.com/dashboard for its status, raise LOOMLOCALE_JOB_TIMEOUT (seconds), or delete the run-state file (<lockfile>.run.json) to start fresh.`,
    );
  }
  if (err instanceof ApiError && err.code === 'spend_cap_reached') {
    throw new TongueError('TONGUE_E_BUDGET', `Spending cap exceeded — ${err.message}. Raise --max-cost / cloud.budget.maxCostGBP or narrow the run.`);
  }
  throw err;
}
