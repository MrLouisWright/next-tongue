import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockLoomlocale, type MockFault } from '../../scripts/mock-loomlocale.mjs';
import { allowanceLeftFrom, runUpdate } from './update.js';

const mocks: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(mocks.splice(0).map((m) => m.close()));
});

async function run(opts: { faults?: MockFault[]; account?: Record<string, unknown> } = {}) {
  const mock = createMockLoomlocale({ projects: [{ id: 'prj_1', name: 'demo', sourceLocale: 'en', targetLocales: ['ca'] }], faults: opts.faults ?? [], account: opts.account ?? {} });
  const url = await mock.listen();
  mocks.push(mock);
  const dir = await mkdtemp(join(tmpdir(), 'tongue-106-'));
  await mkdir(join(dir, 'messages'));
  await writeFile(join(dir, 'messages/en.json'), JSON.stringify({ 'device.lead': 'We sent a code to {email}.', plain: 'Hello' }));
  await writeFile(join(dir, 'tongue.config.mjs'), `export default { locales: ['en','ca'], defaultLocale: 'en', messages: './messages/{locale}.json', cloud: { projectId: 'prj_1' } };\n`);
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => logs.push(a.join(' '));
  try {
    await runUpdate({ cwd: dir, env: { LOOMLOCALE_API_URL: url, LOOMLOCALE_TOKEN: 'llt_test', LOOMLOCALE_NO_KEYCHAIN: '1', XDG_CONFIG_HOME: join(dir, '.cfg') }, yes: true, pollIntervalMs: 1, confirmPlan: async () => true });
  } finally {
    console.log = orig;
  }
  return { mock, out: logs.join('\n').replaceAll(String.fromCharCode(27), '') };
}

describe('1.0.6 estimate + summary', () => {
  it('sends the masked text (__TONGUE_n__) to /estimate, matching what /translate gets', async () => {
    const { mock } = await run();
    const items = mock.state.estimates.flatMap((e) => e.items as Array<{ key: string; text: string }>);
    expect(items.find((i) => i.key === 'device.lead')?.text).toBe('We sent a code to __TONGUE_0__.');
    expect(items.some((i) => i.text.includes('{email}'))).toBe(false);
  });

  it('summary shows billed (sum of jobs), est. and allowance left from /me after the jobs', async () => {
    const { out } = await run({ account: { allowanceRemaining: 9000, bonusCharsRemaining: 500 } });
    // "We sent a code to ." (19) + "Hello" (5): placeholders are not billed.
    expect(out).toMatch(/Usage: 24 chars billed · est\. 24 · 9,500 chars allowance left/);
    expect(out).not.toContain('from allowance');
  });

  it('omits the allowance line when /me fails', async () => {
    const { out } = await run({ faults: [{ match: 'GET /me', mode: 'status', status: 500, times: 99 }], account: { allowanceRemaining: 9000 } });
    expect(out).toMatch(/Usage: 24 chars billed · est\. 24/);
    expect(out).not.toContain('allowance left');
  });

  it('allowanceLeftFrom adds bonus chars and ignores missing fields', () => {
    expect(allowanceLeftFrom({ allowanceRemaining: 100, bonusCharsRemaining: 50 })).toBe(150);
    expect(allowanceLeftFrom({ bonusCharsRemaining: 50 })).toBe(50);
    expect(allowanceLeftFrom({ allowanceRemaining: null })).toBeNull();
    expect(allowanceLeftFrom(null)).toBeNull();
  });
});
