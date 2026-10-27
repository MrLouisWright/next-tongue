/** Regression tests for the 1.0.1 CLI fixes (TUI redraw, estimate wording, low-credit hint, job polling/resume). */
/* eslint-disable no-control-regex */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockLoomlocale } from '../../scripts/mock-loomlocale.mjs';
import { JobTimeoutError, LoomlocaleClient, describeEstimate, jobErrorMessage, lowCreditHint, runNeedsNoCredit } from './api.js';
import { countTerminalRows, createTtyPrompter, displayWidth, stripAnsi, truncateToWidth, type Progress, type Prompter, type TtyInput } from './tui.js';
import { createLinePrompter } from './tui.js';
import { runUpdate } from '../cli/update.js';
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
const base = { quiet: true, pollIntervalMs: 1, clientOptions: noSleep } as const;
async function project(url: string, extra = '') {
  const dir = await mkdtemp(join(tmpdir(), 'tongue-101-'));
  await mkdir(join(dir, 'messages'));
  await writeFile(join(dir, 'messages/en.json'), JSON.stringify({ home: { title: 'Hello, {name}!', body: 'Welcome <b>back</b>' } }));
  await writeFile(
    join(dir, 'tongue.config.mjs'),
    `export default {\n  locales: ['en', 'de', 'fr'],\n  defaultLocale: 'en',\n  messages: './messages/{locale}.json',\n  cloud: { projectId: 'prj_1', ${extra} },\n};\n`,
  );
  const env: NodeJS.ProcessEnv = { LOOMLOCALE_NO_KEYCHAIN: '1', LOOMLOCALE_NO_BROWSER: '1', XDG_CONFIG_HOME: join(dir, '.cfg'), LOOMLOCALE_API_URL: url, LOOMLOCALE_TOKEN: 'llt_test' };
  return { dir, env };
}

describe('1) TTY prompts: wrap-aware redraw and raw-mode restore', () => {
  it('measures and truncates rows by terminal cells', () => {
    expect(stripAnsi('\x1b[36m◆\x1b[0m hi')).toBe('◆ hi');
    expect(displayWidth('日本')).toBe(4);
    expect(countTerminalRows(['a'.repeat(80), 'b'.repeat(81), ''], 80)).toBe(4);
    const t = truncateToWidth(`\x1b[2m${'x'.repeat(100)}\x1b[0m`, 20);
    expect(displayWidth(t)).toBe(20);
    expect(t.endsWith('\x1b[0m')).toBe(true);
  });

  function fakeTty(columns: number) {
    const input = new PassThrough() as unknown as TtyInput & PassThrough;
    const modes: boolean[] = [];
    Object.assign(input, { isTTY: true, isRaw: false, setRawMode: (m: boolean) => void (modes.push(m), ((input as { isRaw: boolean }).isRaw = m)) });
    let written = '';
    const output = { columns, write: (s: string) => void (written += s), on: () => {}, off: () => {} };
    return { input, output, modes, get written() { return written; } };
  }

  it('multiselect clears exactly the previous frame (no duplicated headers on narrow terminals) and restores cooked mode', async () => {
    const tty = fakeTty(30); // narrower than the header → would soft-wrap before the fix
    const pr = createTtyPrompter({ input: tty.input, output: tty.output });
    const choices = ['en', 'de', 'fr', 'es', 'it'].map((v) => ({ value: v, label: v, hint: `language ${v} with a long hint` }));
    const p = pr.multiselect('Target languages', choices, {});
    const keys = ['\x1b[B', ' ', '\x1b[B', ' ', '\x1b[A', '\r'];
    for (const k of keys) {
      await new Promise((r) => setImmediate(r));
      tty.input.write(k);
    }
    expect(await p).toEqual(['de', 'fr']);
    // Every frame: cursor-up by the previous frame's row count, then clear to end of screen.
    const frames = tty.written.split('\r\x1b[0J').slice(1);
    expect(frames.length).toBe(keys.length);
    for (const f of frames) {
      const rows = f.replace(/\r\x1b\[\d+A$/, '').replace(/\x1b\[\?25[hl]/g, '').split('\n').filter(Boolean);
      for (const r of rows) expect(displayWidth(r)).toBeLessThan(30); // no soft wrap
    }
    const ups = [...tty.written.matchAll(/\x1b\[(\d+)A/g)].map((m) => Number(m[1]));
    expect(ups.length).toBe(keys.length - 1);
    const firstFrameRows = frames[0]!.split('\n').filter((l) => stripAnsi(l).replace(/\r\x1b\[\d+A|\x1b\[\?25[hl]/g, '').trim()).length;
    expect(ups[0]).toBe(firstFrameRows);
    expect(tty.modes.at(-1)).toBe(false); // raw mode restored
    expect(tty.written).toContain('\x1b[?25h'); // cursor shown again
  });

  it('restores the previous raw-mode state and drains buffered keys after a prompt', async () => {
    const tty = fakeTty(80);
    const pr: Prompter = createTtyPrompter({ input: tty.input, output: tty.output });
    const p = pr.confirm('Continue?');
    await new Promise((r) => setImmediate(r));
    tty.input.write('y');
    expect(await p).toBe(true);
    expect(tty.modes).toEqual([true, false]);
    expect(tty.input.isPaused()).toBe(true);
  });
});

describe('2) estimate wording and allowance maths', () => {
  const gbp = (n: number) => `£${n.toFixed(2)}`;
  it('subtracts the run from the allowance and reads naturally', () => {
    const d = describeEstimate({ chars: 20_477, billableChars: 0, costGBP: 0, allowanceRemaining: 50_000, withinAllowance: true }, gbp);
    expect(d.included).toBe(true);
    expect(d.text).toBe('Included in your plan: uses 20,477 chars of your allowance (29,523 chars of allowance left after this run)');
    expect(d.text).not.toMatch(/wouldbe|would be/);
  });
  it('explains partial allowance cover using the server billableChars', () => {
    const d = describeEstimate({ chars: 41_968, billableChars: 11_037, costGBP: 0.28, allowanceRemaining: 30_931, withinAllowance: false }, gbp);
    expect(d.included).toBe(false);
    expect(d.text).toBe('30,931 of 41,968 chars covered by your allowance; estimated cost £0.28 for the remaining 11,037 billable chars (0 chars of allowance left after this run)');
  });
  it('plain PAYG estimate', () => {
    expect(describeEstimate({ chars: 100, billableChars: 100, costGBP: 0.01, allowanceRemaining: null, withinAllowance: false }, gbp).text).toBe('Estimated cost £0.01 (100 billable chars)');
  });
  it('mock estimate bills only the chars beyond the allowance', async () => {
    const { url } = await startMock({ plan: { name: 'Free', kind: 'free', charsIncluded: 10, charsUsed: 0, paygPerMillionGBP: 25 } });
    const c = new LoomlocaleClient({ baseURL: url, token: 'llt_test', ...noSleep });
    const e = await c.estimate('prj_1', { sourceLocale: 'en', targetLocales: ['de'], items: [{ key: 'a', text: 'x'.repeat(25) }] });
    expect(e).toMatchObject({ chars: 25, billableChars: 15, allowanceRemaining: 10, withinAllowance: false });
  });
});

describe('3) low-credit hint only when the run needs credit', () => {
  const me = { creditBalanceGBP: 0, credit: { lowCredit: true, topUpUrl: 'https://t/u' }, plan: { name: 'Free', kind: 'free' as const, charsIncluded: 50_000, charsUsed: 0, paygPerMillionGBP: 25 } };
  it('suppresses for runs covered by the allowance; keeps it when credit is needed', () => {
    expect(lowCreditHint(me, { chars: 41_968, billableChars: 0, costGBP: 0, withinAllowance: true })).toBeNull();
    expect(lowCreditHint(me, { chars: 1000 })).toBeNull();
    expect(lowCreditHint(me, { chars: 60_000 })).toMatch(/credit is low \(£0\.00\)/);
    expect(lowCreditHint(me, { chars: 1, billableChars: 1, costGBP: 0.01, creditRequiredGBP: 0.01 })).toMatch(/credit is low/);
    expect(lowCreditHint(me)).toMatch(/credit is low/); // whoami: no run context
    expect(runNeedsNoCredit(me, null)).toBe(false);
  });
  it('tongue update on a Free plan within allowance prints no low-credit warning', async () => {
    const { url } = await startMock({ creditBalanceGBP: 0, plan: { name: 'Free', kind: 'free', charsIncluded: 50_000, charsUsed: 0, paygPerMillionGBP: 25 } });
    const p = await project(url);
    const errs: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errs.push(a.join(' ')));
    try {
      const s = await runUpdate({ cwd: p.dir, env: p.env, locale: 'de', ...base, yes: true });
      expect(s.translated).toBe(2);
      expect(errs.join('\n')).not.toMatch(/credit is low/);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('4) job polling: visible state, failures, timeout, resumed progress', () => {
  it('times out a stuck (queued) job with a resume hint and keeps the run state', async () => {
    const { url } = await startMock({ stuckJobs: true });
    const p = await project(url);
    const err = (await runUpdate({ cwd: p.dir, env: p.env, locale: 'de', ...base, jobStallTimeoutMs: 5 }).catch((e: unknown) => e)) as TongueError;
    expect(err).toBeInstanceOf(TongueError);
    expect(err.code).toBe('TONGUE_E_JOB_TIMEOUT');
    expect(err.message).toMatch(/job_1 is still queued after \d+s with no progress/);
    expect(err.message).toMatch(/re-running `tongue update` resumes/);
    const st = JSON.parse(await readFile(join(p.dir, 'tongue.lock.run.json'), 'utf8'));
    expect(Object.values(st.batches)[0]).toMatchObject({ jobId: 'job_1' });
  });

  it('waitForJob reports status each poll and enforces the overall timeout', async () => {
    const { url } = await startMock({ stuckJobs: true });
    const c = new LoomlocaleClient({ baseURL: url, token: 'llt_test', ...noSleep });
    const job = await c.translate('prj_1', { sourceLocale: 'en', targetLocales: ['de'], items: [{ key: 'a', text: 'A' }], placeholderPattern: '__TONGUE_n__', idempotencyKey: 'k' });
    let t = 0;
    const seen: string[] = [];
    const err = await c.waitForJob(job.id, { now: () => (t += 1000), timeoutMs: 3000, stallTimeoutMs: 1e9, onProgress: (j) => void seen.push(j.status) }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JobTimeoutError);
    expect((err as JobTimeoutError).reason).toBe('timeout');
    expect(seen.every((s) => s === 'queued')).toBe(true);
  });

  it('surfaces the server error message of a failed job', async () => {
    const { url } = await startMock({ failJobs: { error: 'provider_error', message: 'DeepL quota exceeded' } });
    const p = await project(url);
    const errs: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errs.push(a.join(' ')));
    try {
      const s = await runUpdate({ cwd: p.dir, env: p.env, locale: 'de', ...base, quiet: false, yes: true, prompter: createLinePrompter([]) });
      expect(s.failed[0]!.reason).toBe('job failed: provider_error: DeepL quota exceeded');
      expect(errs.join('\n')).toMatch(/job job_\d+ \(de\) failed: provider_error: DeepL quota exceeded/);
    } finally {
      spy.mockRestore();
    }
    expect(jobErrorMessage({ error: { code: 'x', message: 'boom' } })).toBe('boom');
  });

  it('counts batches recorded by an interrupted run in the progress bar', async () => {
    const { url } = await startMock();
    const p = await project(url, 'batchSize: 1');
    const prev = process.exitCode;
    await runUpdate({ cwd: p.dir, env: p.env, locale: 'de', ...base, prompter: createLinePrompter(['n']) }); // decline review → state kept
    process.exitCode = prev;
    const ticks: number[] = [];
    let total = 0;
    const pr = { ...createLinePrompter(['y']), progress: (_l: string, t: number): Progress => ((total = t), { tick: (n = 1) => void ticks.push(n), done: () => {} }) };
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')));
    try {
      const s = await runUpdate({ cwd: p.dir, env: p.env, locale: 'de', ...base, quiet: false, yes: true, prompter: pr });
      expect(s.resumed).toBe(true);
    } finally {
      spy.mockRestore();
    }
    expect(total).toBe(2);
    expect(ticks.reduce((a, b) => a + b, 0)).toBe(2); // counted once, up front
    expect(ticks[0]).toBe(2);
    expect(logs.join('\n')).toMatch(/2 batch\(es\) recorded .*: 2\/2 key\(s\) already done/);
  });
});
