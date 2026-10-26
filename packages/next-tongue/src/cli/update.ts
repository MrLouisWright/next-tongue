/**
 * `tongue update` — incremental sync with Loomlocale:
 * pull web edits + glossary → hash diff vs tongue.lock → translate only
 * new/changed keys → drop deleted keys → push results.
 */
import { readFile } from 'node:fs/promises';
import { TongueError } from '../errors.js';
import { localCostGBP, type SyncEntry } from '../cloud/api.js';
import { readCatalog, writeCatalog, type Catalog, type Flat } from '../cloud/dictionaries.js';
import {
  countChars,
  diffCatalogs,
  loadGlossary,
  loadLock,
  lockSection,
  mergeGlossary,
  saveLock,
  sha,
  translateViaCloud,
  type KeyMeta,
  type PlanItem,
} from '../cloud/engine.js';
import { formatGBP, loadProject, makeClient, type CloudGlobals, type ProjectContext } from '../cloud/project.js';
import { color, createPrompter, type Prompter, type Progress } from '../cloud/tui.js';
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
};

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
  const summary: UpdateSummary = { translated: 0, failed: [], removed: 0, pulled: 0, conflicts: 0, billedChars: 0, plannedChars: 0, plan: [], files: [] };
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

  if (opts.dryRun) {
    if (opts.json) console.log(JSON.stringify({ plan, removed: diff.removed, localEdits: diff.localEdits, chars: summary.plannedChars }));
    else {
      log(`tongue update: dry-run — ${plan.length} key(s) to translate (${summary.plannedChars.toLocaleString('en-GB')} chars, ~${formatGBP(localCostGBP(summary.plannedChars))} PAYG)`);
      for (const p of plan) log(`  + ${p.locale} ${p.key} ${color.dim(`(${p.reason})`)}`);
      for (const [l, keys] of Object.entries(diff.removed)) for (const k of keys) log(`  - ${l} ${k} ${color.dim('(deleted in source)')}`);
      for (const e of diff.localEdits) log(`  ~ ${e.locale} ${e.key} ${color.dim('(local edit kept)')}`);
    }
    return summary;
  }

  const budget = opts.maxChars ?? ctx.config.translate?.maxChars;
  if (budget != null && summary.plannedChars > budget) {
    throw new TongueError('TONGUE_E_CONFIG', `Run needs ${summary.plannedChars} chars, over budget ${budget} (--max-chars or translate.maxChars).`);
  }

  // 3. translate
  if (plan.length && client) {
    if (!projectId) throw new TongueError('TONGUE_E_CONFIG', 'No Loomlocale project linked. Run `tongue link`.');
    let bar: Progress | null = null;
    const result = await translateViaCloud({
      client,
      projectId,
      sourceLocale: ctx.sourceLocale,
      plan,
      glossary,
      ...(ctx.config.translate?.context ? { context: ctx.config.translate.context } : {}),
      meta,
      ...(opts.pollIntervalMs != null ? { pollIntervalMs: opts.pollIntervalMs } : {}),
      onLocaleStart: (l, total) => {
        bar?.done();
        bar = opts.quiet || opts.json ? null : (opts.prompter ?? createPrompter([])).progress(`${ctx.sourceLocale} → ${l}`, total);
      },
      onProgress: (_l, job) => {
        if (bar) bar.tick(0, `${job.status} ${job.progress.done}/${job.progress.total}`);
      },
    });
    (bar as Progress | null)?.done();
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

  // 5. write
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
    log(`tongue update: wrote ${summary.files.length} review file(s); run \`tongue translate --accept\` after review`);
    return summary;
  }
  for (const [l, b] of Object.entries(pending)) {
    summary.files.push(...(await writeCatalog({ cwd: ctx.cwd, source, sourceLocale: ctx.sourceLocale, locale: l, set: b.set, remove: b.remove })));
  }

  // 6. push
  if (sync && client && projectId) {
    const entries: SyncEntry[] = [];
    for (const [k, v] of Object.entries(source.flat)) entries.push({ key: k, locale: ctx.sourceLocale, text: v, sourceHash: sha(v), origin: 'cli' });
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
