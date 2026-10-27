/** 1.0.3: aggregated progress across all jobs, per-language line, parallel job creation + joint polling. */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockLoomlocale } from '../../scripts/mock-loomlocale.mjs';
import { JobPoller, RunProgress } from './engine.js';
import { JobTimeoutError, type Job } from './api.js';
import { createLinePrompter, displayWidth, fitSegments, type Progress } from './tui.js';
import { runUpdate } from '../cli/update.js';

type Mock = ReturnType<typeof createMockLoomlocale>;
const mocks: Mock[] = [];
afterEach(async () => {
  while (mocks.length) await mocks.pop()!.close();
});
const job = (id: string, status: Job['status'], done: number, total: number, extra: Partial<Job> = {}): Job => ({ id, status, progress: { done, total }, ...extra });

describe('RunProgress', () => {
  it('sums progress.done over all jobs on every poll regardless of status', () => {
    const plan = [...Array(599)].flatMap((_, i) => ['de', 'fr', 'es', 'it'].map((locale) => ({ locale, key: `k${i}` })));
    const p = new RunProgress(['de', 'fr', 'es', 'it'], plan);
    expect(p.overall()).toEqual({ done: 0, total: 2396 });
    p.update('de', job('j1', 'running', 556, 599), { slot: 'de', batchSize: 599 });
    p.update('fr', job('j2', 'running', 540, 599), { slot: 'fr', batchSize: 599 });
    p.update('es', job('j3', 'queued', 0, 599), { slot: 'es', batchSize: 599 });
    p.update('it', job('j4', 'failed', 120, 599, { error: 'provider_error', message: 'quota' }), { slot: 'it', batchSize: 599 });
    expect(p.overall()).toEqual({ done: 556 + 540 + 120, total: 2396 });
    expect(p.segments()).toEqual(['it failed: provider_error: quota 120/599', 'de 556/599', 'fr 540/599', 'es queued 0/599']);
  });

  it('falls back to batch size when a job reports no total, and counts resumed keys', () => {
    const p = new RunProgress(['de'], [{ locale: 'de' }, { locale: 'de' }, { locale: 'de' }], ['de\0a']);
    expect(p.overall()).toEqual({ done: 1, total: 3 });
    p.update('de', job('j', 'queued', 0, 0), { slot: 's', batchSize: 2 });
    expect(p.overall()).toEqual({ done: 1, total: 3 });
    p.update('de', job('j', 'succeeded', 0, 0), { slot: 's', batchSize: 2 });
    expect(p.overall()).toEqual({ done: 3, total: 3 });
  });

  it('fits language segments to the width, keeping the first (failed) ones', () => {
    const segs = ['it failed: boom 1/9', 'de 556/599', 'fr 540/599', 'es 0/599', 'ja 1/599'];
    const out = fitSegments(segs, 40);
    expect(displayWidth(out)).toBeLessThanOrEqual(40);
    expect(out.startsWith('it failed: boom')).toBe(true);
    expect(out).toMatch(/\+\d+ more$/);
    expect(fitSegments(['de 1/2', 'fr 1/2'], 80)).toBe('de 1/2 · fr 1/2');
  });
});

describe('JobPoller', () => {
  it('polls all jobs together, the first round immediately, then every interval', async () => {
    const calls: string[][] = [];
    let round: string[] = [];
    const polls = new Map<string, number>();
    const client = {
      job: async (id: string) => {
        round.push(id);
        const n = (polls.get(id) ?? 0) + 1;
        polls.set(id, n);
        return n >= 3 ? job(id, 'succeeded', 5, 5) : job(id, 'running', n, 5);
      },
    };
    const sleeps: number[] = [];
    const poller = new JobPoller(client, {
      intervalMs: 1000,
      sleep: async (ms) => {
        sleeps.push(ms);
        calls.push(round);
        round = [];
      },
    });
    const [a, b] = await Promise.all([poller.wait('a'), poller.wait('b')]);
    expect(a.status).toBe('succeeded');
    expect(b.status).toBe('succeeded');
    expect(calls[0]).toEqual(['a', 'b']); // both in the first (immediate) round, before any sleep
    expect(sleeps.every((ms) => ms === 1000)).toBe(true);
    expect(sleeps.length).toBe(2);
  });

  it('keeps the stall timeout per job', async () => {
    let t = 0;
    const poller = new JobPoller({ job: async (id) => job(id, 'queued', 0, 5) }, { now: () => (t += 1000), stallTimeoutMs: 3000, sleep: async () => {} });
    await expect(poller.wait('x')).rejects.toBeInstanceOf(JobTimeoutError);
  });
});

describe('tongue update progress', () => {
  it('creates all language jobs in parallel, draws 0/total first, then aggregates every poll', async () => {
    const mock = createMockLoomlocale({ projects: [{ id: 'prj_1', name: 'demo', sourceLocale: 'en', targetLocales: ['de', 'fr'] }], queuedPolls: 1, pollsToFinish: 4, progressPerPoll: 1 });
    mocks.push(mock);
    const url = await mock.listen();
    const dir = await mkdtemp(join(tmpdir(), 'tongue-103-'));
    await mkdir(join(dir, 'messages'));
    const en = Object.fromEntries([...Array(30)].map((_, i) => [`k${i}`, `Text ${i}`]));
    await writeFile(join(dir, 'messages/en.json'), JSON.stringify(en));
    await writeFile(join(dir, 'tongue.config.mjs'), `export default { locales: ['en','de','fr'], defaultLocale: 'en', messages: './messages/{locale}.json', cloud: { projectId: 'prj_1' } };\n`);
    const env = { LOOMLOCALE_NO_KEYCHAIN: '1', LOOMLOCALE_NO_BROWSER: '1', XDG_CONFIG_HOME: join(dir, '.cfg'), LOOMLOCALE_API_URL: url, LOOMLOCALE_TOKEN: 'llt_test' };
    const sets: Array<{ done: number; total: number; segs: string[]; jobsPolled: number }> = [];
    const pr = {
      ...createLinePrompter(['y']),
      progress: (): Progress => ({
        tick: () => {},
        set: (done, total, segs = []) => void sets.push({ done, total, segs, jobsPolled: mock.state.requests.filter((r) => r.path.startsWith('/jobs/')).length }),
        done: () => {},
      }),
    };
    const s = await runUpdate({ cwd: dir, env, quiet: false, yes: true, pollIntervalMs: 1, clientOptions: { sleep: async () => {}, random: () => 0 }, prompter: pr });
    expect(s.translated).toBe(60);
    expect(sets[0]).toMatchObject({ done: 0, total: 60, jobsPolled: 0 });
    // both jobs created before the first poll
    const reqs = mock.state.requests.map((r) => r.path);
    const firstPoll = reqs.findIndex((p) => p.startsWith('/jobs/'));
    expect(reqs.slice(0, firstPoll).filter((p) => p.endsWith('/translate')).length).toBe(2);
    // a mid-run frame reports running progress (10 + …) from both jobs, not 0
    const mid = sets.find((x) => x.done < 60 && /^de \d+\/30 · fr \d+\/30$/.test(x.segs.join(' · ')) && x.done > 0)!;
    expect(mid).toBeDefined();
    expect(mid.segs.join(' · ')).toMatch(/^de \d+\/30 · fr \d+\/30$/);
    expect(mid.done).toBeGreaterThanOrEqual(20); // 10 + 10 at first running poll
    expect(sets.at(-1)).toMatchObject({ done: 60, total: 60 });
  });
});
