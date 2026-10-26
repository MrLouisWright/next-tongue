/** 1.0 cloud features against the mock server: retries, resume, budget, review/diff, PR mode, concurrency. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockLoomlocale } from '../../scripts/mock-loomlocale.mjs';
import { ApiError, LoomlocaleClient, aggregateEstimates, backoffDelay, creditExpiry, creditExpiryWarning, lowCreditHint, normalizeErrorBody, parseRetryAfter } from './api.js';
import { enforceBudget, resolveBudget } from './budget.js';
import { makeBatches } from './engine.js';
import { runUpdate } from '../cli/update.js';
import { runCli } from '../cli/index.js';
import { cmdLogin, cmdWhoami, describePlan } from '../cli/cloud.js';
import { buildChanges, renderChanges, repoSlugFromRemote } from '../cli/review.js';
import { createLinePrompter } from './tui.js';
import { TongueError } from '../errors.js';

type Mock = ReturnType<typeof createMockLoomlocale>;
const mocks: Mock[] = [];
afterEach(async () => {
  while (mocks.length) await mocks.pop()!.close();
});
async function startMock(opts: Parameters<typeof createMockLoomlocale>[0] = {}) {
  const mock = createMockLoomlocale({ projects: [{ id: 'prj_1', name: 'demo', sourceLocale: 'en', targetLocales: ['de', 'fr'] }], ...opts });
  mocks.push(mock);
  return { mock, url: await mock.listen() };
}
const noSleep = { sleep: async () => {}, random: () => 0 };

async function project(url: string, extra = '', en: Record<string, unknown> = { home: { title: 'Hello, {name}!', body: 'Welcome <b>back</b>' } }) {
  const dir = await mkdtemp(join(tmpdir(), 'tongue-feat-'));
  await mkdir(join(dir, 'messages'));
  await writeFile(join(dir, 'messages/en.json'), JSON.stringify(en));
  await writeFile(
    join(dir, 'tongue.config.mjs'),
    `export default {\n  locales: ['en', 'de', 'fr'],\n  defaultLocale: 'en',\n  messages: './messages/{locale}.json',\n  cloud: { projectId: 'prj_1', ${extra} },\n};\n`,
  );
  const env: NodeJS.ProcessEnv = { LOOMLOCALE_NO_KEYCHAIN: '1', LOOMLOCALE_NO_BROWSER: '1', XDG_CONFIG_HOME: join(dir, '.cfg'), LOOMLOCALE_API_URL: url, LOOMLOCALE_TOKEN: 'llt_test' };
  return { dir, env };
}
const noSleepGlobals = { clientOptions: noSleep } as const;
const base = { quiet: true, pollIntervalMs: 1, clientOptions: noSleep } as const;
const translates = (m: Mock) => m.state.requests.filter((r) => r.path.endsWith('/translate'));
const exists = (p: string) => access(p).then(() => true, () => false);

describe('retry / backoff', () => {
  it('parses Retry-After seconds and HTTP dates; backoff grows with jitter', () => {
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4000)).toBe(6000);
    expect(parseRetryAfter('soon')).toBeNull();
    expect(backoffDelay(0, 2000, 500, () => 0)).toBe(2000);
    expect(backoffDelay(0, null, 500, () => 0)).toBe(250);
    expect(backoffDelay(3, null, 500, () => 0.999)).toBeLessThanOrEqual(4000);
    expect(backoffDelay(20, null, 500, () => 1)).toBe(30_000);
  });

  it('honours 429 Retry-After on translate and job polls, then succeeds', async () => {
    const { mock, url } = await startMock({ rateLimit: { translate: 2, job: 1, retryAfter: '2' } });
    const waits: number[] = [];
    const p = await project(url);
    const s = await runUpdate({ cwd: p.dir, env: p.env, locale: 'de', ...base, clientOptions: { sleep: async (ms) => void waits.push(ms), random: () => 0 } });
    expect(s.translated).toBe(2);
    expect(mock.state.rateLimited).toBe(3);
    expect(waits.filter((w) => w === 2000).length).toBeGreaterThanOrEqual(3);
  });

  it('gives up after maxRetries with a clear error', async () => {
    const { url } = await startMock({ rateLimit: { translate: 10, retryAfter: '0' } });
    const c = new LoomlocaleClient({ baseURL: url, token: 'llt_test', maxRetries: 2, ...noSleep });
    const err = await c
      .translate('prj_1', { sourceLocale: 'en', targetLocales: ['de'], items: [{ key: 'a', text: 'A' }], placeholderPattern: '__TONGUE_n__', idempotencyKey: 'k1' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
    expect(String(err)).toMatch(/retries exhausted/);
  });

  it('sends a deterministic Idempotency-Key; the server dedupes repeats', async () => {
    const { mock, url } = await startMock();
    const p = await project(url);
    await runUpdate({ cwd: p.dir, env: p.env, locale: 'de', ...base });
    const keys = translates(mock).map((r) => r.idempotencyKey);
    expect(keys.length).toBe(1);
    expect(keys[0]).toMatch(/^[0-9a-f]{40}$/);
    expect((translates(mock)[0]!.body as { idempotencyKey: string }).idempotencyKey).toBe(keys[0]);
  });
});

describe('resume', () => {
  it('persists job ids and resumes polling the same job after a dropped connection', async () => {
    const { mock, url } = await startMock({ dropJobPolls: 100 });
    const p = await project(url, 'maxRetries: 0');
    await expect(runUpdate({ cwd: p.dir, env: p.env, locale: 'de', ...base })).rejects.toThrow(/Cannot reach/);
    const state = JSON.parse(await readFile(join(p.dir, 'tongue.lock.run.json'), 'utf8'));
    const rec = Object.values(state.batches)[0] as { jobId: string; done?: boolean };
    expect(rec.jobId).toBe('job_1');
    expect(rec.done).toBeUndefined();
    expect(await exists(join(p.dir, 'messages/de.json'))).toBe(false);

    mock.state.dropJobPolls = 0;
    const s = await runUpdate({ cwd: p.dir, env: p.env, locale: 'de', ...base });
    expect(s.resumed).toBe(true);
    expect(s.translated).toBe(2);
    expect(translates(mock).length).toBe(1); // no second translate request
    expect(await exists(join(p.dir, 'tongue.lock.run.json'))).toBe(false);
  });

  it('reuses finished batches from an interrupted run without re-billing', async () => {
    const { mock, url } = await startMock();
    const p = await project(url);
    const prev = process.exitCode;
    // decline at the review prompt → nothing written, finished batches kept
    const s1 = await runUpdate({ cwd: p.dir, env: p.env, ...base, quiet: true, prompter: createLinePrompter(['n']) });
    process.exitCode = prev;
    expect(s1.changes.length).toBe(4);
    expect(await exists(join(p.dir, 'messages/de.json'))).toBe(false);
    const n = translates(mock).length;
    const s2 = await runUpdate({ cwd: p.dir, env: p.env, ...base, yes: true });
    expect(s2.translated).toBe(4);
    expect(s2.billedChars).toBe(0);
    expect(translates(mock).length).toBe(n);
  });
});

describe('budget', () => {
  it('resolves flag → env → cloud.budget → translate.maxChars', () => {
    const cfg = { cloud: { budget: { maxChars: 100, maxCostGBP: 5, monthlyChars: 1000 } }, translate: { maxChars: 7 } } as never;
    expect(resolveBudget(cfg, {}, {})).toEqual({ maxChars: 100, maxCostGBP: 5, monthlyChars: 1000 });
    expect(resolveBudget(cfg, { maxChars: 1 }, { LOOMLOCALE_MAX_CHARS: '50', LOOMLOCALE_MAX_COST: '2' })).toMatchObject({ maxChars: 1, maxCostGBP: 2 });
    expect(() => resolveBudget(cfg, {}, { LOOMLOCALE_MAX_COST: 'lots' })).toThrow(/LOOMLOCALE_MAX_COST/);
    expect(() => enforceBudget({}, { chars: 1, billableChars: 1, costGBP: 0, withinSpendCap: false, note: 'cap' })).toThrow(/spend cap/);
    expect(() => enforceBudget({ monthlyChars: 10 }, { chars: 5, billableChars: 5, costGBP: 0 }, { name: 'x', kind: 'payg', charsIncluded: 0, charsUsed: 6, paygPerMillionGBP: 25 })).toThrow(/monthly cap/);
  });

  it('aborts with TONGUE_E_BUDGET (exit 1) before translating when over cloud.budget / env caps', async () => {
    const { mock, url } = await startMock();
    const p = await project(url, 'budget: { maxChars: 20 }');
    const err = await runUpdate({ cwd: p.dir, env: p.env, ...base }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TongueError);
    expect((err as TongueError).code).toBe('TONGUE_E_BUDGET');
    expect(String(err)).toMatch(/Spending cap exceeded.*max 20 per run/);
    expect(translates(mock).length).toBe(0);
    const q = await project(url);
    await expect(runUpdate({ cwd: q.dir, env: { ...q.env, LOOMLOCALE_MAX_CHARS: '5' }, ...base })).rejects.toThrow(/Spending cap/);
    await expect(runUpdate({ cwd: q.dir, env: q.env, dryRun: true, maxChars: 5, ...base })).rejects.toThrow(/Spending cap/);
    expect(translates(mock).length).toBe(0);
  });

  it('uses the server estimate (identical texts once) and its spend-cap verdict for --max-cost', async () => {
    const { mock, url } = await startMock({ plan: { name: 'PAYG', kind: 'payg', charsIncluded: 0, charsUsed: 0, paygPerMillionGBP: 1_000_000 }, spendCapGBP: 1000 });
    const p = await project(url, '', { a: 'Same text', b: 'Same text' });
    // 9 chars once (dedupe) × 2 locales = 18 chars → £18 at £1/char
    await expect(runUpdate({ cwd: p.dir, env: p.env, maxCost: 17, ...base })).rejects.toThrow(/£18\.00 > max £17\.00/);
    mock.state.spendCapGBP = 5;
    await expect(runUpdate({ cwd: p.dir, env: p.env, ...base, maxCost: 100 })).rejects.toThrow(/organisation spend cap/);
    expect(translates(mock).length).toBe(0);
    mock.state.spendCapGBP = null;
    const s = await runUpdate({ cwd: p.dir, env: p.env, ...base, maxCost: 18 });
    expect(s.translated).toBe(4);
  });
});

describe('review diff', () => {
  it('builds added/changed/removed changes and renders without colour under NO_COLOR', () => {
    const changes = buildChanges({ de: { set: { a: 'A2', b: 'B' }, remove: ['c'] } }, { de: { a: 'A1', c: 'C' } });
    expect(changes).toEqual([
      { locale: 'de', key: 'a', kind: 'changed', before: 'A1', after: 'A2' },
      { locale: 'de', key: 'b', kind: 'added', after: 'B' },
      { locale: 'de', key: 'c', kind: 'removed', before: 'C' },
    ]);
    const prev = process.env.NO_COLOR;
    process.env.NO_COLOR = '1';
    const out = renderChanges(changes);
    if (prev === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = prev;
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/\u001b\[/);
    expect(out).toContain('- A1');
    expect(out).toContain('+ A2');
    expect(out).toContain('1 added, 1 changed, 1 removed');
  });

  it('--json includes the per-key diff; confirm=yes writes', async () => {
    const { url } = await startMock();
    const p = await project(url);
    const logs: string[] = [];
    const orig = console.log;
    console.log = (m: unknown) => void logs.push(String(m));
    try {
      await runUpdate({ cwd: p.dir, env: p.env, pollIntervalMs: 1, clientOptions: noSleep, json: true, locale: 'de' });
    } finally {
      console.log = orig;
    }
    const out = JSON.parse(logs.at(-1)!);
    expect(out.changes).toContainEqual({ locale: 'de', key: 'home.title', kind: 'added', after: '[de] Hello, {name}!' });
    const s = await runUpdate({ cwd: p.dir, env: p.env, ...base, locale: 'fr', prompter: createLinePrompter(['y']) });
    expect(s.files).toContain('messages/fr.json');
  });

  it('--out-dir stages dictionaries + lock without touching the working files', async () => {
    const { url } = await startMock();
    const p = await project(url);
    const s = await runUpdate({ cwd: p.dir, env: p.env, ...base, yes: true, outDir: '.tongue-staging' });
    expect(s.translated).toBe(4);
    expect(await exists(join(p.dir, 'messages/de.json'))).toBe(false);
    expect(await exists(join(p.dir, 'tongue.lock'))).toBe(false);
    expect(JSON.parse(await readFile(join(p.dir, '.tongue-staging/messages/de.json'), 'utf8')).home.title).toBe('[de] Hello, {name}!');
    expect(JSON.parse(await readFile(join(p.dir, '.tongue-staging/tongue.lock'), 'utf8')).version).toBe(2);
  });

  it('--review pr commits to a new branch, pushes, opens a PR and leaves the working tree alone', async () => {
    const { mock, url } = await startMock();
    const p = await project(url);
    const remote = await mkdtemp(join(tmpdir(), 'tongue-remote-'));
    const git = (args: string[], cwd = p.dir) => {
      const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' } });
      if (r.status !== 0) throw new Error(r.stderr);
      return r.stdout.trim();
    };
    git(['init', '--bare', '-q', remote], remote);
    git(['init', '-q', '-b', 'main']);
    git(['add', '-A']);
    git(['commit', '-qm', 'init']);
    git(['remote', 'add', 'origin', remote]);
    const prCalls: Array<{ url: string; body: { head: string; base: string; title: string; body: string }; auth: string | null }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const u = String(input);
      if (u.startsWith('https://gh.test/')) {
        prCalls.push({ url: u, body: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get('authorization') });
        return new Response(JSON.stringify({ html_url: 'https://github.com/o/r/pull/7' }), { status: 201 });
      }
      return fetch(input, init);
    };
    const env = { ...p.env, GITHUB_TOKEN: 'ghs_fake', GITHUB_REPOSITORY: 'o/r', GITHUB_API_URL: 'https://gh.test', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' };
    const s = await runUpdate({ cwd: p.dir, env, ...base, yes: true, reviewMode: 'pr', fetchImpl });
    expect(s.pr?.url).toBe('https://github.com/o/r/pull/7');
    expect(prCalls[0]!.url).toBe('https://gh.test/repos/o/r/pulls');
    expect(prCalls[0]!.auth).toBe('Bearer ghs_fake');
    expect(prCalls[0]!.body.base).toBe('main');
    expect(prCalls[0]!.body.body).toContain('| de | `home.title` | added |');
    expect(git(['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('main');
    expect(await exists(join(p.dir, 'messages/de.json'))).toBe(false);
    const files = git(['ls-tree', '-r', '--name-only', s.pr!.branch], remote);
    expect(files.split('\n')).toEqual(expect.arrayContaining(['messages/de.json', 'messages/fr.json', 'tongue.lock']));
    expect(mock.state.requests.some((r) => r.path.endsWith('/sync') && (r.body as { mode: string }).mode === 'push')).toBe(false);
  });

  it('parses GitHub remotes', () => {
    expect(repoSlugFromRemote('git@github.com:MrLouisWright/next-tongue.git')).toBe('MrLouisWright/next-tongue');
    expect(repoSlugFromRemote('https://github.com/o/r')).toBe('o/r');
    expect(repoSlugFromRemote('https://gitlab.com/o/r')).toBeNull();
  });
});

describe('batching + concurrency', () => {
  it('splits by key count and characters', () => {
    const items = ['aaaa', 'bb', 'cccccc', 'd'].map((source) => ({ source }));
    expect(makeBatches(items, 2, 100).map((b) => b.length)).toEqual([2, 2]);
    expect(makeBatches(items, 10, 6).map((b) => b.map((x) => x.source))).toEqual([['aaaa', 'bb'], ['cccccc'], ['d']]);
  });

  it('translates locales concurrently up to --concurrency, batching per request', async () => {
    const one = await startMock({ pollsToFinish: 4 });
    const p1 = await project(one.url, 'batchSize: 1');
    await runUpdate({ cwd: p1.dir, env: p1.env, ...base, concurrency: 1 });
    expect(one.mock.state.maxActive).toBe(1);
    expect(translates(one.mock).length).toBe(4); // 2 keys × 2 locales, 1 key per request

    const two = await startMock({ pollsToFinish: 4 });
    const p2 = await project(two.url);
    const s = await runUpdate({ cwd: p2.dir, env: p2.env, ...base, concurrency: 4 });
    expect(s.translated).toBe(4);
    expect(two.mock.state.maxActive).toBe(2);
    expect(translates(two.mock).length).toBe(2);
  });
});

describe('server f9a71b9 contract', () => {
  it('treats expired_token (unknown/redeemed device code) as restart-login', async () => {
    const { url } = await startMock();
    const p = await project(url);
    const fetchImpl: typeof fetch = async (input, init) =>
      String(input).endsWith('/device/token') ? new Response(JSON.stringify({ error: 'expired_token' }), { status: 400 }) : fetch(input, init);
    const orig = console.log;
    console.log = () => {};
    try {
      await expect(cmdLogin({ env: p.env, baseURL: url, fetchImpl, noBrowser: true, sleep: async () => {} })).rejects.toThrow(/no longer valid.*tongue login/);
    } finally {
      console.log = orig;
    }
  });

  it('requests contract scopes, gets llt_ token + echoed scope, ignores extra fields', async () => {
    const { mock, url } = await startMock();
    const c = new LoomlocaleClient({ baseURL: url });
    const code = await c.deviceCode();
    expect((mock.state.requests.at(-1)!.body as { scope: string }).scope).toBe('projects translate sync');
    await c.deviceToken(code.device_code);
    const tok = await c.deviceToken(code.device_code);
    expect(tok).toMatchObject({ access_token: 'llt_test', scope: 'projects translate sync' });
    // redeemed → expired_token
    expect(await c.deviceToken(code.device_code)).toEqual({ error: 'expired_token' });
    const me = await new LoomlocaleClient({ baseURL: url, token: 'llt_test' }).me();
    expect(me.user.email).toBe('dev@example.com');
  });

  it('pushes source entries with their dictionary file', async () => {
    const { mock, url } = await startMock();
    const p = await project(url);
    await runUpdate({ cwd: p.dir, env: p.env, ...base, locale: 'de' });
    const src = [...mock.state.entries.values()].find((e) => e.locale === 'en' && e.key === 'home.title');
    expect(src?.file).toBe('messages/en.json');
    const de = [...mock.state.entries.values()].find((e) => e.locale === 'de');
    expect(de?.file).toBe('en.json'); // server default file_path for keys without a file
  });
});

describe('server 83d98cb contract (requests 8–11) + prepaid credits', () => {
  const keys = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, `Text ${i}`]));

  it('on 409 (Idempotency-Key reused) retries once with a fresh key', async () => {
    const { mock, url } = await startMock({ conflicts: 1 });
    const p = await project(url);
    const s = await runUpdate({ cwd: p.dir, env: p.env, ...base, concurrency: 1 });
    expect(s.translated).toBe(4);
    const t = translates(mock);
    expect(t.length).toBe(3); // one 409 + retry, then the second locale
    expect(t[1]!.idempotencyKey).not.toBe(t[0]!.idempotencyKey);
    expect(t[1]!.idempotencyKey!.startsWith(t[0]!.idempotencyKey!.slice(0, 40))).toBe(true);
  });

  it('a second 409 is not retried again', async () => {
    const { url } = await startMock({ conflicts: 2 });
    const client = new LoomlocaleClient({ baseURL: url, token: 'llt_test', ...noSleep });
    const err = await client
      .translate('prj_1', { sourceLocale: 'en', targetLocales: ['de'], items: [{ key: 'a', text: 'A' }], glossary: {}, idempotencyKey: 'k'.repeat(40) })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
  });

  it('on 413 splits the batch and retries the halves', async () => {
    // /me publishes nothing → defaults (1000 items); the server actually enforces 2 items.
    const { mock, url } = await startMock({ limits: null, enforceLimits: { maxItems: 2, maxSourceChars: 200000, maxTargetLocales: 50 } });
    const p = await project(url, '', keys(5));
    const s = await runUpdate({ cwd: p.dir, env: p.env, ...base, concurrency: 1 });
    expect(s.translated).toBe(10);
    expect(mock.state.translateSizes.every((n) => n <= 2)).toBe(true);
    expect(mock.state.translateSizes.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('batches by the limits published on /me', async () => {
    const { mock, url } = await startMock({ limits: { translate: { maxItems: 3, maxSourceChars: 200000, maxTargetLocales: 50 } } });
    const p = await project(url, '', keys(7));
    await runUpdate({ cwd: p.dir, env: p.env, ...base });
    expect([...mock.state.translateSizes].sort()).toEqual([1, 1, 3, 3, 3, 3]);
    expect(translates(mock).every((r) => r.idempotencyKey)).toBe(true);
  });

  it('uses plan.periodSpendGBP for monthly £ caps, else derives it from charsUsed', () => {
    const plan = { name: 'PAYG', kind: 'payg' as const, charsIncluded: 0, charsUsed: 1_000_000, paygPerMillionGBP: 25 };
    const est = { chars: 10, billableChars: 10, costGBP: 1 };
    expect(() => enforceBudget({ monthlyCostGBP: 20 }, est, plan)).toThrow(/£26\.00 this period/);
    expect(() => enforceBudget({ monthlyCostGBP: 20 }, est, { ...plan, periodSpendGBP: 3 })).not.toThrow();
    expect(() => enforceBudget({ monthlyCostGBP: 20 }, est, { ...plan, periodSpendGBP: 19.5 })).toThrow(/£20\.50 this period/);
  });

  it('reads creditBalanceGBP from /me and the estimate when present', async () => {
    const { url } = await startMock({ creditBalanceGBP: 12.5 });
    const client = new LoomlocaleClient({ baseURL: url, token: 'llt_test', ...noSleep });
    expect((await client.me()).creditBalanceGBP).toBe(12.5);
    const est = await client.estimate('prj_1', { sourceLocale: 'en', targetLocales: ['de'], items: [{ key: 'a', text: 'A' }] });
    expect(est.creditBalanceGBP).toBe(12.5);
    const none = await startMock();
    expect((await new LoomlocaleClient({ baseURL: none.url, token: 'llt_test' }).me()).creditBalanceGBP).toBeUndefined();
  });

  it('402 insufficient_credit prints balance + top-up URL, exits 4 and is not retried', async () => {
    const { mock, url } = await startMock({ insufficientCredit: { topUpUrl: 'https://loomlocale.test/top-up' }, creditBalanceGBP: 0.2 });
    const p = await project(url);
    const err = await runUpdate({ cwd: p.dir, env: p.env, ...base, concurrency: 1 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(402);
    expect((err as ApiError).topUpUrl).toBe('https://loomlocale.test/top-up');
    expect(String((err as Error).message)).toMatch(/Insufficient Loomlocale credit: this run needs £1\.50, balance is £0\.20\. .*Top up at https:\/\/loomlocale\.test\/top-up and re-run\. \(request id req_\d+\)/);
    expect(translates(mock).length).toBe(1);
    // Through the CLI: clear message, exit 1.
    const saved = { ...process.env };
    Object.assign(process.env, p.env, { NO_COLOR: '1' });
    const errs: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errs.push(a.join(' ')));
    const prevExit = process.exitCode;
    try {
      await runCli(['update', '--yes', '--quiet', '--cwd', p.dir]);
      expect(process.exitCode).toBe(4);
      expect(errs.join('\n')).toMatch(/Top up at https:\/\/loomlocale\.test\/top-up/);
    } finally {
      spy.mockRestore();
      process.exitCode = prevExit;
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
    expect(translates(mock).length).toBe(2);
  });

  it('402 without topUpUrl falls back to the dashboard billing page; prefers details.balanceGBP', async () => {
    const { url } = await startMock({ insufficientCredit: { topUpUrl: null }, creditBalanceGBP: 3 });
    const client = new LoomlocaleClient({ baseURL: url, token: 'llt_test', ...noSleep });
    const err = (await client
      .translate('prj_1', { sourceLocale: 'en', targetLocales: ['de'], items: [{ key: 'a', text: 'A' }], glossary: {}, idempotencyKey: 'x'.repeat(40) })
      .catch((e: unknown) => e)) as ApiError;
    expect(err.topUpUrl).toBe('https://loomlocale.com/dashboard/billing');
    expect(err.message).toMatch(/needs £1\.50, balance is £3\.00\. .*Top up at https:\/\/loomlocale\.com\/dashboard\/billing/);
  });

  it('parses credit expiry variants and warns only within 30 days', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    expect(creditExpiry({ nextExpiry: '2026-11-10', nextExpiryGBP: 12.5 })).toEqual({ date: new Date('2026-11-10'), amountGBP: 12.5 });
    expect(creditExpiry({ nextExpiry: '2026-11-10', expiringGBP: 2 })?.amountGBP).toBe(2);
    expect(creditExpiry({ nextExpiry: { date: '2026-11-10', amountGBP: 4 } })?.amountGBP).toBe(4);
    expect(creditExpiry({ nextExpiry: 'not a date' })).toBeNull();
    expect(creditExpiry({})).toBeNull();
    expect(creditExpiryWarning({ nextExpiry: '2026-11-10', nextExpiryGBP: 12.5 }, now)).toMatch(/£12\.50 of Loomlocale credit expires on 2026-11-10 \(in 15 days\)/);
    expect(creditExpiryWarning({ nextExpiry: '2027-01-10', nextExpiryGBP: 12.5 }, now)).toBeNull();
    expect(creditExpiryWarning({ nextExpiry: '2026-10-01', nextExpiryGBP: 12.5 }, now)).toBeNull();
    expect(creditExpiryWarning({ nextExpiry: '2026-11-10' }, now)).toMatch(/^⚠ Loomlocale credit expires/);
  });

  it('warns about soon-expiring credit in whoami and before translating in update', async () => {
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const { url } = await startMock({ creditBalanceGBP: 20, creditExpiry: { nextExpiry: soon, nextExpiryGBP: 7 } });
    const p = await project(url);
    const errs: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errs.push(a.join(' ')));
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await cmdWhoami({ cwd: p.dir, env: p.env, ...noSleepGlobals });
      expect(errs.join('\n')).toMatch(new RegExp(`£7\\.00 of Loomlocale credit expires on ${soon}`));
      errs.length = 0;
      await runUpdate({ cwd: p.dir, env: p.env, ...base });
      expect(errs.filter((e) => /expires on/.test(e)).length).toBe(1);
    } finally {
      spy.mockRestore();
      out.mockRestore();
    }
  });
});

describe('prepaid credits contract (flat error envelope, withinCredit, plan kinds)', () => {
  const tr = (c: LoomlocaleClient) =>
    c.translate('prj_1', { sourceLocale: 'en', targetLocales: ['de'], items: [{ key: 'a', text: 'A' }], glossary: {}, idempotencyKey: 'y'.repeat(40) }).catch((e: unknown) => e as ApiError);

  it('reads the 402 from both the flat and the nested error envelope, with request_id', async () => {
    for (const nestedErrors of [false, true]) {
      const { url } = await startMock({ insufficientCredit: {}, creditBalanceGBP: 0.25, nestedErrors });
      const err = await tr(new LoomlocaleClient({ baseURL: url, token: 'llt_test', ...noSleep }));
      expect(err.code).toBe('insufficient_credit');
      expect(err.requestId).toMatch(/^req_/);
      expect(err.topUpUrl).toBe('https://loomlocale.test/billing/top-up');
      expect(err.message).toMatch(/needs £1\.50, balance is £0\.25.*\(request id req_\d+\)/);
    }
    expect(normalizeErrorBody({ error: { code: 'x', message: 'm', request_id: 'r' } })).toEqual({ error: 'x', message: 'm', request_id: 'r' });
    expect(normalizeErrorBody({ error: 'x', details: { a: 1 } })).toEqual({ error: 'x', details: { a: 1 } });
  });

  it('withinCredit: false on the estimate aborts before translating with exit-4 credit error; summed across locales', async () => {
    const { mock, url } = await startMock({ plan: { name: 'Credits', kind: 'credits', charsIncluded: 0, charsUsed: 0, paygPerMillionGBP: 1_000_000 }, creditBalanceGBP: 30 });
    const p = await project(url, '', { a: 'Twenty characters!!!' }); // 20 chars → £20 per locale, £40 total > £30
    const err = await runUpdate({ cwd: p.dir, env: p.env, ...base, maxCost: 100 }).catch((e: unknown) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('insufficient_credit');
    expect(err.message).toMatch(/needs £40\.00, balance is £30\.00.*Top up at https:\/\/loomlocale\.com\/dashboard\/billing/);
    expect(translates(mock).length).toBe(0);
  });

  it('ignores the deprecated withinSpendCap when withinCredit is present', () => {
    expect(() => enforceBudget({}, { chars: 1, billableChars: 1, costGBP: 1, withinCredit: true, withinSpendCap: false, allowed: false })).not.toThrow();
    expect(() => enforceBudget({}, { chars: 1, billableChars: 1, costGBP: 1, withinSpendCap: false })).toThrow(/organisation spend cap/);
    const e = (() => {
      try {
        enforceBudget({}, { chars: 1, billableChars: 1, costGBP: 1, withinCredit: false, creditRequiredGBP: 2, creditBalanceGBP: 1 });
      } catch (x) {
        return x as ApiError;
      }
    })();
    expect(e?.code).toBe('insufficient_credit');
    expect(e?.topUpUrl).toBe('https://loomlocale.com/dashboard/billing');
    expect(aggregateEstimates([
      { chars: 1, billableChars: 1, costGBP: 6, currency: 'GBP', allowanceRemaining: null, withinAllowance: false, withinCredit: true, creditRequiredGBP: 6, creditBalanceGBP: 10 },
      { chars: 1, billableChars: 1, costGBP: 6, currency: 'GBP', allowanceRemaining: null, withinAllowance: false, withinCredit: true, creditRequiredGBP: 6, creditBalanceGBP: 10 },
    ] as never)).toMatchObject({ withinCredit: false, creditRequiredGBP: 12, creditBalanceGBP: 10 });
  });

  it('maps spend_cap_reached (job maxCostGBP) to TONGUE_E_BUDGET', async () => {
    const { url } = await startMock({ spendCapReached: true });
    const p = await project(url);
    const err = await runUpdate({ cwd: p.dir, env: p.env, ...base }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TongueError);
    expect((err as TongueError).code).toBe('TONGUE_E_BUDGET');
    expect(String(err)).toMatch(/Spending cap exceeded.*max_cost_gbp/);
  });

  it('handles free | credits | subscription plan kinds and shows a low-credit hint', async () => {
    expect(describePlan({ plan: { name: 'Credits', kind: 'credits', charsIncluded: 0, charsUsed: 0, paygPerMillionGBP: 25 } } as never)).toMatch(/£25\.00 per 1M chars/);
    expect(describePlan({ plan: { name: 'Free', kind: 'free', charsIncluded: 10000, charsUsed: 2000, paygPerMillionGBP: 25 } } as never)).toMatch(/8,000 of 10,000 chars left/);
    expect(() => enforceBudget({ monthlyCostGBP: 1 }, { chars: 1, billableChars: 1, costGBP: 0 }, { name: 'S', kind: 'subscription', charsIncluded: 1e6, charsUsed: 9e9, paygPerMillionGBP: 25 })).not.toThrow();
    expect(lowCreditHint({ creditBalanceGBP: 0.5, credit: { lowCredit: true, topUpUrl: 'https://t/u' } })).toBe('Loomlocale credit is low (£0.50). Top up at https://t/u.');
    expect(lowCreditHint({ creditBalanceGBP: 50, credit: { lowCredit: false } })).toBeNull();
    const { url } = await startMock({ creditBalanceGBP: 0.5 });
    const p = await project(url);
    const errs: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errs.push(a.join(' ')));
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const me = await cmdWhoami({ cwd: p.dir, env: p.env, ...noSleepGlobals });
      expect(me.plan.kind).toBe('credits');
      expect(me.credit?.lowCredit).toBe(true);
      expect(errs.join('\n')).toMatch(/Loomlocale credit is low \(£0\.50\)\. Top up at https:\/\/loomlocale\.test\/top-up/);
    } finally {
      spy.mockRestore();
      out.mockRestore();
    }
  });
});
