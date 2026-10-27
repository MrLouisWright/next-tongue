import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockLoomlocale, type MockFault } from '../../scripts/mock-loomlocale.mjs';
import { ApiError, LoomlocaleClient, timeoutSignal, type SyncEntry } from './api.js';
import { JobPoller, sha } from './engine.js';
import { pushInBatches } from './sync-batch.js';
import { interruptMessage, runUpdate } from '../cli/update.js';

const mocks: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(mocks.splice(0).map((m) => m.close()));
});
async function start(faults: MockFault[] = [], extra: Record<string, unknown> = {}) {
  const mock = createMockLoomlocale({ projects: [{ id: 'prj_1', name: 'demo', sourceLocale: 'en', targetLocales: ['de'] }], faults, ...extra });
  const url = await mock.listen();
  mocks.push(mock);
  return { mock, url };
}
const noSleep = { sleep: async () => {}, random: () => 0 };
const entries = (n: number): SyncEntry[] => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, locale: 'de', text: `t${i}`, sourceHash: sha(`s${i}`), origin: 'cli' as const }));
const syncReqs = (mock: Awaited<ReturnType<typeof start>>['mock']) => mock.state.requests.filter((r) => r.path.endsWith('/sync'));

describe('1.0.5 batched /sync push', () => {
  it('pushes 8,371 entries in sequential batches of 2,000, passing the cursor along', async () => {
    const { mock, url } = await start();
    const c = new LoomlocaleClient({ baseURL: url, token: 'llt_test' });
    const progress: string[] = [];
    const r = await pushInBatches(c, 'prj_1', { sourceLocale: 'en', entries: entries(8371) }, { onBatch: (d, t) => progress.push(`${d}/${t}`) });
    expect(mock.state.syncPushSizes).toEqual([2000, 2000, 2000, 2000, 371]);
    expect(progress).toEqual(['2000/8371', '4000/8371', '6000/8371', '8000/8371', '8371/8371']);
    const cursors = syncReqs(mock).map((q) => (q.body as { cursor?: string }).cursor);
    expect(cursors).toEqual([undefined, 'c1', 'c2', 'c3', 'c4']);
    expect(r).toMatchObject({ cursor: 'c5', batches: 5, accepted: 8371 });
  });

  it('first run prints "first sync: pushed 2,000/4,500" progress', async () => {
    const { mock, url } = await start();
    const dir = await mkdtemp(join(tmpdir(), 'tongue-105-'));
    await mkdir(join(dir, 'messages'));
    const en: Record<string, string> = {};
    const de: Record<string, string> = {};
    for (let i = 0; i < 4500; i++) {
      en[`k${i}`] = `Text ${i}`;
      de[`k${i}`] = `Text ${i} de`;
    }
    await writeFile(join(dir, 'messages/en.json'), JSON.stringify(en));
    await writeFile(join(dir, 'messages/de.json'), JSON.stringify(de));
    await writeFile(join(dir, 'tongue.config.mjs'), `export default { locales: ['en','de'], defaultLocale: 'en', messages: './messages/{locale}.json', cloud: { projectId: 'prj_1' } };\n`);
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => logs.push(a.join(' '));
    try {
      await runUpdate({ cwd: dir, env: { LOOMLOCALE_API_URL: url, LOOMLOCALE_TOKEN: 'llt_test', LOOMLOCALE_NO_KEYCHAIN: '1', XDG_CONFIG_HOME: join(dir, '.cfg') }, yes: true, pollIntervalMs: 1 });
    } finally {
      console.log = orig;
    }
    const out = logs.join('\n');
    expect(out).toContain('first sync: pushed 2,000/4,500');
    expect(out).toContain('first sync: pushed 4,500/4,500');
    expect(mock.state.syncPushSizes.slice(0, 3)).toEqual([2000, 2000, 500]);
  });
});

describe('1.0.5 timeouts and retries', () => {
  it('a /sync push that times out is reported once, not retried, with a nothing-billed hint', async () => {
    const { mock, url } = await start([{ match: 'POST /sync', mode: 'hang', times: 5 }]);
    const retries: string[] = [];
    const c = new LoomlocaleClient({ baseURL: url, token: 'llt_test', timeouts: { sync: 1000 }, onRetry: (i) => retries.push(i.message ?? ''), ...noSleep });
    const err = (await c.sync('prj_1', { mode: 'push', sourceLocale: 'en', entries: entries(1) }).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.code).toBe('timeout');
    expect(err.message).toMatch(/Loomlocale didn't answer within 1s \(POST \/projects\/prj_1\/sync\)/);
    expect(err.message).toMatch(/Nothing was billed/);
    expect(syncReqs(mock)).toHaveLength(1);
    expect(retries).toEqual([]);
  });

  it('retries an immediate connection reset at most 2 times, with clear messages', async () => {
    const { mock, url } = await start([{ match: 'POST /sync', mode: 'reset', times: 2 }]);
    const retries: string[] = [];
    const c = new LoomlocaleClient({ baseURL: url, token: 'llt_test', onRetry: (i) => retries.push(i.message ?? ''), ...noSleep });
    await c.sync('prj_1', { mode: 'push', sourceLocale: 'en', entries: entries(1) });
    expect(retries).toEqual([
      'Loomlocale reset the connection (POST /projects/prj_1/sync), retrying 1/2',
      'Loomlocale reset the connection (POST /projects/prj_1/sync), retrying 2/2',
    ]);
    expect(mock.state.syncPushSizes).toEqual([1]);

    mock.state.faults.push({ match: 'POST /sync', mode: 'reset', times: 3 });
    const err = (await c.sync('prj_1', { mode: 'push', sourceLocale: 'en', entries: entries(1) }).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('network');
    expect(err.message).toMatch(/Nothing was billed/);
    expect(mock.state.faultHits.length).toBe(5);
  });

  it('502/504 are retried for GET and sync pull only, never for a push', async () => {
    const { mock, url } = await start([
      { match: 'POST /sync', mode: 'status', status: 504, times: 1, syncMode: 'push' },
      { match: 'POST /sync', mode: 'status', status: 504, times: 1, syncMode: 'pull' },
      { match: 'GET /me', mode: 'status', status: 502, times: 1 },
    ]);
    const c = new LoomlocaleClient({ baseURL: url, token: 'llt_test', ...noSleep });
    const push = (await c.sync('prj_1', { mode: 'push', sourceLocale: 'en', entries: entries(1) }).catch((e: unknown) => e)) as ApiError;
    expect(push.status).toBe(504);
    expect(syncReqs(mock).filter((r) => (r.body as { mode: string }).mode === 'push')).toHaveLength(1);
    await expect(c.sync('prj_1', { mode: 'pull', sourceLocale: 'en' })).resolves.toMatchObject({ cursor: expect.any(String) });
    await expect(c.me()).resolves.toMatchObject({ user: { email: 'dev@example.com' } });
    expect(mock.state.faultHits.map((h) => h.sig)).toEqual(['POST /sync', 'POST /sync', 'GET /me']);
  });

  it('caps total retry time per call (~3 min)', async () => {
    const { url } = await start([], { rateLimit: { translate: 100, retryAfter: '60' } });
    let slept = 0;
    const c = new LoomlocaleClient({ baseURL: url, token: 'llt_test', maxRetries: 50, sleep: async (ms) => void (slept += ms), random: () => 0 });
    const t0 = Date.now();
    const realNow = Date.now;
    Date.now = () => t0 + slept; // simulated clock driven by the injected sleep
    try {
      const err = (await c
        .translate('prj_1', { sourceLocale: 'en', targetLocales: ['de'], items: [{ key: 'a', text: 'A' }], placeholderPattern: '__TONGUE_n__', idempotencyKey: 'k_budget_1' })
        .catch((e: unknown) => e)) as ApiError;
      expect(err.status).toBe(429);
      expect(err.message).toMatch(/gave up after \d+s of retries/);
      expect(slept).toBeLessThanOrEqual(180_000);
    } finally {
      Date.now = realNow;
    }
  });

  it('a job poll that times out (30s default) is polled again next round', async () => {
    const { url } = await start([{ match: 'GET /jobs/', mode: 'hang', times: 1 }], { pollsToFinish: 1 });
    const c = new LoomlocaleClient({ baseURL: url, token: 'llt_test', timeouts: { poll: 200 }, ...noSleep });
    const job = await c.translate('prj_1', { sourceLocale: 'en', targetLocales: ['de'], items: [{ key: 'a', text: 'A' }], placeholderPattern: '__TONGUE_n__', idempotencyKey: 'k_poll_1' });
    const done = await new JobPoller(c, { intervalMs: 1 }).wait(job.id, () => {});
    expect(done.status).toBe('succeeded');
    expect(c.timeoutFor('GET', '/jobs/x')).toBe(200);
    expect(new LoomlocaleClient({}).timeoutFor('POST', '/projects/p/sync')).toBe(60_000);
    expect(new LoomlocaleClient({}).timeoutFor('GET', '/me')).toBe(60_000);
    expect(new LoomlocaleClient({}).timeoutFor('POST', '/projects/p/estimate')).toBe(60_000);
    expect(new LoomlocaleClient({}).timeoutFor('GET', '/jobs/j')).toBe(30_000);
  });

  it('timeoutSignal falls back when AbortSignal.timeout is missing', async () => {
    const AS = AbortSignal as unknown as { timeout?: unknown };
    const real = AS.timeout;
    AS.timeout = undefined;
    try {
      const s = timeoutSignal(10);
      await new Promise((r) => setTimeout(r, 30));
      expect(s.aborted).toBe(true);
      expect((s.reason as Error).name).toBe('TimeoutError');
    } finally {
      AS.timeout = real;
    }
  });

  it('Ctrl-C message says where the run stopped and that it can be resumed', () => {
    expect(interruptMessage({ phase: 'translating (1,200/5,980 strings done)', statePath: 'tongue.lock.run.json', resumable: true })).toBe(
      '\nInterrupted (Ctrl-C) during translating (1,200/5,980 strings done). Finished batches are saved in tongue.lock.run.json; re-run `tongue update` to resume (finished work is not billed again).',
    );
    expect(interruptMessage({ phase: 'first sync: pushed 2,000/8,371', statePath: null, resumable: false })).toMatch(/during first sync: pushed 2,000\/8,371\. re-run `tongue update`.*nothing was billed/);
  });
});
