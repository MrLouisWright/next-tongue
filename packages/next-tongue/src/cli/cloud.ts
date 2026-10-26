/** Loomlocale account + project commands: login, logout, whoami, link, status, push, pull. */
import { TongueError } from '../errors.js';
import { LoomlocaleClient, TOKEN_PREFIX, allowanceLines, creditExpiryWarning, lowCreditHint, type Me, type Project, type SyncEntry } from '../cloud/api.js';
import { createCredentialStore } from '../cloud/credentials.js';
import { readCatalog, writeCatalog, type Flat } from '../cloud/dictionaries.js';
import { diffCatalogs, loadLock, lockSection, saveLock, sha } from '../cloud/engine.js';
import { formatGBP, loadProject, makeClient, openBrowser, resolveBaseURL, writeCloudConfig, type CloudGlobals } from '../cloud/project.js';
import { sourceFileIndex } from './update.js';
import { color, createPrompter, type Prompter } from '../cloud/tui.js';

type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function cmdLogin(opts: CloudGlobals & { noBrowser?: boolean; sleep?: Sleep }): Promise<Me> {
  const env = opts.env ?? process.env;
  const baseURL = resolveBaseURL(opts);
  const client = new LoomlocaleClient({ baseURL, ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}) });
  const code = await client.deviceCode();
  const url = code.verification_uri_complete ?? code.verification_uri;
  console.log(`\n  ${color.bold('Log in to Loomlocale')}\n\n  1. Open ${color.cyan(code.verification_uri)}\n  2. Enter code ${color.bold(color.yellow(code.user_code))}\n`);
  if (!opts.noBrowser && openBrowser(url, env)) console.log(color.dim('  (opened your browser)'));
  console.log(color.dim('  Waiting for approval…'));
  const sleep = opts.sleep ?? realSleep;
  let interval = Math.max(1, code.interval || 5) * 1000;
  const deadline = Date.now() + (code.expires_in || 900) * 1000;
  for (;;) {
    if (Date.now() > deadline) throw new TongueError('TONGUE_E_CONFIG', 'Login code expired — run `tongue login` again.');
    await sleep(interval);
    const r = await client.deviceToken(code.device_code);
    if ('access_token' in r) {
      if (!r.access_token.startsWith(TOKEN_PREFIX)) {
        console.warn(color.yellow(`  warning: unexpected token format (Loomlocale tokens start with ${TOKEN_PREFIX})`));
      }
      const store = opts.store ?? createCredentialStore(env);
      const where = await store.set(baseURL, r.access_token);
      const me = await new LoomlocaleClient({ baseURL, token: r.access_token, ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}) }).me();
      console.log(`${color.green('✔')} Logged in as ${color.bold(me.user.email)} (${me.org.name}) — token stored in ${where === 'keychain' ? 'OS keychain' : '~/.config/loomlocale/credentials.json'}`);
      return me;
    }
    if (r.error === 'authorization_pending') continue;
    if (r.error === 'slow_down') {
      interval += 5000;
      continue;
    }
    if (r.error === 'access_denied') throw new TongueError('TONGUE_E_CONFIG', 'Login was denied on loomlocale.com.');
    // expired_token also covers unknown or already-redeemed device codes: start over.
    throw new TongueError('TONGUE_E_CONFIG', 'This login code is no longer valid (expired, or already used). Restart with `tongue login`.');
  }
}

export async function cmdLogout(opts: CloudGlobals): Promise<void> {
  const env = opts.env ?? process.env;
  await (opts.store ?? createCredentialStore(env)).delete(resolveBaseURL(opts));
  if (!opts.quiet) console.log('Logged out of Loomlocale.');
}

export function describePlan(me: Me): string {
  const p = me.plan;
  if (p.kind === 'payg' || p.kind === 'credits' || (p.kind === 'free' && !p.charsIncluded)) return `${p.name} (${formatGBP(p.paygPerMillionGBP)} per 1M chars)`;
  const left = Math.max(0, p.charsIncluded - p.charsUsed);
  return `${p.name} (${left.toLocaleString('en-GB')} of ${p.charsIncluded.toLocaleString('en-GB')} chars left${p.periodEnd ? `, resets ${p.periodEnd.slice(0, 10)}` : ''})`;
}

export async function cmdWhoami(opts: CloudGlobals): Promise<Me> {
  const me = await (await makeClient(opts)).me();
  if (opts.json) console.log(JSON.stringify(me));
  else console.log(`${me.user.email} · ${me.org.name} · ${describePlan(me)}${typeof me.creditBalanceGBP === 'number' ? ` · credit £${me.creditBalanceGBP.toFixed(2)}` : ''}`);
  const warn = opts.json ? null : creditExpiryWarning(me);
  if (warn) console.error(color.yellow(warn));
  const low = opts.json ? null : lowCreditHint(me);
  if (low) console.error(color.yellow(low));
  if (!opts.json) for (const line of allowanceLines(me)) console.log(line.startsWith('Add a card') ? color.yellow(line) : line);
  return me;
}

export async function cmdLink(opts: CloudGlobals & { project?: string; create?: string; prompter?: Prompter }): Promise<Project> {
  const ctx = await loadProject(opts);
  const client = await makeClient(opts, ctx.config);
  const projects = await client.listProjects();
  let project: Project | undefined;
  if (opts.project) {
    project = projects.find((p) => p.id === opts.project || p.name === opts.project);
    if (!project) throw new TongueError('TONGUE_E_CONFIG', `No project ${opts.project}`);
  } else if (opts.create) {
    project = await client.createProject({ name: opts.create, sourceLocale: ctx.sourceLocale, targetLocales: ctx.targetLocales });
  } else {
    const pr = opts.prompter ?? createPrompter();
    const choice = await pr.select('Loomlocale project', [
      ...projects.map((p) => ({ value: p.id, label: p.name, hint: `${p.sourceLocale} → ${p.targetLocales.join(', ')}` })),
      { value: '__new__', label: color.green('+ Create a new project') },
    ]);
    if (choice === '__new__') {
      const name = await pr.text('Project name', { default: ctx.cwd.split(/[\\/]/).pop() ?? 'my-app' });
      project = await client.createProject({ name, sourceLocale: ctx.sourceLocale, targetLocales: ctx.targetLocales });
    } else project = projects.find((p) => p.id === choice)!;
  }
  if (!ctx.configPath) throw new TongueError('TONGUE_E_CONFIG', 'No tongue.config.* to write to.');
  await writeCloudConfig(ctx.configPath, {
    projectId: project.id,
    ...(ctx.config.cloud.files ? { files: ctx.config.cloud.files } : {}),
    ...(ctx.config.cloud.baseURL ? { baseURL: ctx.config.cloud.baseURL } : {}),
  });
  if (!opts.quiet) console.log(`${color.green('✔')} Linked to ${color.bold(project.name)} (${project.id})`);
  return project;
}

export async function cmdStatus(opts: CloudGlobals): Promise<void> {
  const ctx = await loadProject(opts);
  const source = await readCatalog(ctx.cwd, ctx.patterns, ctx.sourceLocale);
  const targets: Record<string, Flat> = {};
  for (const l of ctx.targetLocales) targets[l] = (await readCatalog(ctx.cwd, ctx.patterns, l)).flat;
  const lock = await loadLock(ctx.cwd, ctx.lockPath);
  const diff = diffCatalogs({ source: source.flat, targets, lock, locales: ctx.targetLocales });
  const rows = ctx.targetLocales.map((l) => {
    const p = diff.plan.filter((x) => x.locale === l);
    return {
      locale: l,
      new: p.filter((x) => x.reason === 'new' || x.reason === 'missing').length,
      changed: p.filter((x) => x.reason === 'changed').length,
      removed: diff.removed[l]?.length ?? 0,
      localEdits: diff.localEdits.filter((x) => x.locale === l).length,
    };
  });
  const status = {
    project: ctx.config.cloud.projectId ?? null,
    sourceLocale: ctx.sourceLocale,
    keys: Object.keys(source.flat).length,
    files: ctx.patterns,
    cursor: lock.$cloud?.cursor ?? null,
    locales: rows,
  };
  // Account hints (optional: skipped when not logged in or offline; no retries).
  let me: Me | null = null;
  try {
    const client = await makeClient({ ...opts, clientOptions: { ...opts.clientOptions, maxRetries: 0 } }, ctx.config, true);
    me = await client.me();
  } catch {
    me = null;
  }
  const account = me ? { allowanceRemaining: me.allowanceRemaining ?? null, allowanceType: me.allowanceType ?? null, freeAllowanceClaimed: me.freeAllowanceClaimed ?? null, cardSetupUrl: me.cardSetupUrl ?? null } : null;
  if (opts.json) {
    console.log(JSON.stringify({ ...status, account }));
    return;
  }
  console.log(`${color.bold('Loomlocale')} project: ${status.project ?? color.yellow('not linked (tongue link)')}`);
  console.log(`source ${ctx.sourceLocale}: ${status.keys} keys in ${ctx.patterns.join(', ')}`);
  for (const r of rows) {
    const clean = !r.new && !r.changed && !r.removed;
    console.log(`  ${r.locale.padEnd(8)} ${clean ? color.green('up to date') : `${r.new} new · ${r.changed} changed · ${r.removed} removed`}${r.localEdits ? color.dim(` · ${r.localEdits} local edit(s)`) : ''}`);
  }
  for (const line of allowanceLines(me)) console.log(line.startsWith('Add a card') ? color.yellow(line) : line);
  if (rows.some((r) => r.new || r.changed || r.removed)) process.exitCode = 1;
}

export async function cmdPush(opts: CloudGlobals): Promise<number> {
  const ctx = await loadProject(opts);
  const projectId = ctx.config.cloud.projectId;
  if (!projectId) throw new TongueError('TONGUE_E_CONFIG', 'No project linked. Run `tongue link`.');
  const client = await makeClient(opts, ctx.config);
  const source = await readCatalog(ctx.cwd, ctx.patterns, ctx.sourceLocale);
  const lock = await loadLock(ctx.cwd, ctx.lockPath);
  const fileOf = sourceFileIndex(source);
  const entries: SyncEntry[] = Object.entries(source.flat).map(([k, v]) => {
    const file = fileOf.get(k);
    return { key: k, locale: ctx.sourceLocale, text: v, sourceHash: sha(v), origin: 'cli', ...(file ? { file } : {}) };
  });
  for (const l of ctx.targetLocales) {
    for (const [k, v] of Object.entries((await readCatalog(ctx.cwd, ctx.patterns, l)).flat)) {
      if (k in source.flat && v) entries.push({ key: k, locale: l, text: v, sourceHash: lockSection(lock, l)[k]?.source ?? sha(source.flat[k]!), origin: 'cli' });
    }
  }
  const res = await client.sync(projectId, { mode: 'push', sourceLocale: ctx.sourceLocale, ...(lock.$cloud?.cursor ? { cursor: lock.$cloud.cursor } : {}), entries });
  lock.$cloud = { ...lock.$cloud, projectId, cursor: res.cursor, sourceLocale: ctx.sourceLocale };
  await saveLock(ctx.cwd, ctx.lockPath, lock);
  if (!opts.quiet) console.log(`${color.green('✔')} pushed ${entries.length} strings to Loomlocale`);
  return entries.length;
}

export async function cmdPull(opts: CloudGlobals & { prefer?: 'local' | 'remote'; dryRun?: boolean }): Promise<number> {
  const ctx = await loadProject(opts);
  const projectId = ctx.config.cloud.projectId;
  if (!projectId) throw new TongueError('TONGUE_E_CONFIG', 'No project linked. Run `tongue link`.');
  const client = await makeClient(opts, ctx.config);
  const source = await readCatalog(ctx.cwd, ctx.patterns, ctx.sourceLocale);
  const lock = await loadLock(ctx.cwd, ctx.lockPath);
  const res = await client.sync(projectId, { mode: 'pull', sourceLocale: ctx.sourceLocale, ...(lock.$cloud?.cursor ? { cursor: lock.$cloud.cursor } : {}) });
  const sets: Record<string, Flat> = {};
  let n = 0;
  const conflicts: string[] = [];
  for (const l of ctx.targetLocales) {
    const local = (await readCatalog(ctx.cwd, ctx.patterns, l)).flat;
    const section = lockSection(lock, l);
    for (const e of res.entries.filter((x) => x.locale === l)) {
      const src = source.flat[e.key];
      if (src == null || e.sourceHash !== sha(src) || local[e.key] === e.text) continue;
      const cur = local[e.key];
      const edited = cur != null && cur !== '' && section[e.key] != null && section[e.key]!.target !== sha(cur);
      if (edited && opts.prefer !== 'remote') {
        if (opts.prefer !== 'local') conflicts.push(`${l}:${e.key}`);
        continue;
      }
      (sets[l] ??= {})[e.key] = e.text;
      section[e.key] = { source: e.sourceHash, target: sha(e.text), at: e.updatedAt ?? new Date().toISOString(), origin: e.origin ?? 'web' };
      n++;
    }
  }
  if (conflicts.length) {
    throw new TongueError('TONGUE_E_CONFIG', `Conflicts (edited locally and on loomlocale.com): ${conflicts.join(', ')}. Re-run with --prefer local|remote.`);
  }
  if (!opts.dryRun) {
    for (const [l, set] of Object.entries(sets)) await writeCatalog({ cwd: ctx.cwd, source, sourceLocale: ctx.sourceLocale, locale: l, set, remove: [] });
    lock.$cloud = { ...lock.$cloud, projectId, cursor: res.cursor, sourceLocale: ctx.sourceLocale };
    await saveLock(ctx.cwd, ctx.lockPath, lock);
  }
  if (!opts.quiet) console.log(`${color.green('✔')} pulled ${n} web edit(s)${opts.dryRun ? ' (dry-run)' : ''}`);
  return n;
}
