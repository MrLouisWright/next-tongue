import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockLoomlocale } from '../../scripts/mock-loomlocale.mjs';
import { aggregateEstimates, type Estimate } from './api.js';
import { canonicalGlossary, diffCatalogs, sha } from './engine.js';
import { formatGrossVsCache, formatResumeSplit, runUpdate } from '../cli/update.js';
import { estimatePlanLine, runWizard } from '../cli/wizard.js';
import { createLinePrompter } from './tui.js';

const mock = createMockLoomlocale({
  projects: [{ id: 'prj_1', name: 'demo', sourceLocale: 'en', targetLocales: ['de', 'fr'] }],
  glossary: { Zeta: { doNotTranslate: true }, Alpha: { de: 'Alfa', note: 'brand' } },
  translationMemory: true,
});
let baseURL = '';
beforeAll(async () => {
  baseURL = await mock.listen();
});
afterAll(() => mock.close());

async function project(en: Record<string, string>, de?: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), 'tongue-104-'));
  await mkdir(join(dir, 'messages'));
  await writeFile(join(dir, 'messages/en.json'), JSON.stringify(en));
  if (de) await writeFile(join(dir, 'messages/de.json'), JSON.stringify(de));
  await writeFile(join(dir, 'glossary.json'), JSON.stringify({ terms: { Loom: { doNotTranslate: true } } }));
  await writeFile(
    join(dir, 'tongue.config.mjs'),
    `export default {\n  locales: ['en', 'de', 'fr'],\n  defaultLocale: 'en',\n  messages: './messages/{locale}.json',\n  translate: { glossary: './glossary.json' },\n  cloud: { projectId: 'prj_1' },\n};\n`,
  );
  const env = { LOOMLOCALE_NO_KEYCHAIN: '1', LOOMLOCALE_NO_BROWSER: '1', XDG_CONFIG_HOME: join(dir, '.cfg'), LOOMLOCALE_API_URL: baseURL, LOOMLOCALE_TOKEN: 'llt_test' };
  return { dir, env };
}

async function capture<T>(fn: () => Promise<T>): Promise<{ out: string; value: T }> {
  const logs: string[] = [];
  const orig = console.log;
  const write = process.stdout.write;
  console.log = (...a: unknown[]) => logs.push(a.join(' '));
  process.stdout.write = ((s: string) => (logs.push(String(s)), true)) as typeof process.stdout.write;
  try {
    return { value: await fn(), out: logs.join('\n') };
  } finally {
    console.log = orig;
    process.stdout.write = write;
  }
}

const since = (n: number) => mock.state.requests.slice(n);

describe('1.0.4 wizard estimate = the real plan', () => {
  it('counts only missing keys, estimates planned items with the translate glossary, pushes existing targets first', async () => {
    const { dir, env } = await project({ a: 'One', b: 'Two', c: 'Three' }, { a: 'Eins', b: 'Zwei' });
    const r0 = mock.state.requests.length;
    const e0 = mock.state.estimates.length;
    const t0 = mock.state.translateBodies.length;
    const { out } = await capture(() =>
      runWizard({ cwd: dir, env, noBrowser: true, pollIntervalMs: 1, prompter: createLinePrompter(['en', '1', 'de,fr', 'y']) }),
    );
    expect(out).toContain('4 keys need translation · 2 already translated');
    expect(out).toMatch(/de 1 · fr 3/);
    // per language, only planned items
    const ests = mock.state.estimates.slice(e0);
    expect(ests.map((e) => [e.targetLocales[0], e.items.map((i) => i.key)]).sort()).toEqual([['de', ['c']], ['fr', ['a', 'b', 'c']]]);
    const translates = mock.state.translateBodies.slice(t0);
    for (const e of ests) {
      expect(e.sourceLocale).toBe('en');
      expect(e.glossary).toEqual(translates[0]!.glossary);
    }
    expect(Object.keys(translates[0]!.glossary ?? {})).toEqual(['Alpha', 'Loom', 'Zeta']); // canonical (sorted) record
    // first run: existing targets pushed (origin cli + sourceHash) before any estimate/translate
    const reqs = since(r0);
    const push = reqs.findIndex((r) => r.path.endsWith('/sync') && (r.body as { mode: string }).mode === 'push');
    const firstEst = reqs.findIndex((r) => r.path.endsWith('/estimate'));
    expect(push).toBeGreaterThan(-1);
    expect(push).toBeLessThan(firstEst);
    const entries = (reqs[push]!.body as { entries: Array<Record<string, string>> }).entries;
    expect(entries).toEqual(
      expect.arrayContaining([
        { key: 'a', locale: 'de', text: 'Eins', sourceHash: sha('One'), origin: 'cli' },
        { key: 'b', locale: 'de', text: 'Zwei', sourceHash: sha('Two'), origin: 'cli' },
      ]),
    );
    expect(JSON.parse(await readFile(join(dir, 'messages/fr.json'), 'utf8'))).toEqual({ a: '[fr] One', b: '[fr] Two', c: '[fr] Three' });
  });

  it('empty plan prints "Nothing to translate" and skips the confirm', async () => {
    const { dir, env } = await project({ a: 'One' }, { a: 'Eins' });
    await writeFile(join(dir, 'messages/fr.json'), JSON.stringify({ a: 'Un' }));
    const t0 = mock.state.translateBodies.length;
    const { out } = await capture(() => runWizard({ cwd: dir, env, noBrowser: true, pollIntervalMs: 1, prompter: createLinePrompter(['en', '1', 'de,fr']) }));
    expect(out).toContain('Nothing to translate');
    expect(out).not.toContain('Translate into');
    expect(mock.state.translateBodies.length).toBe(t0);
  });

  it('shows gross next to after-cache, and the identical glossary hits the cache on a later run', async () => {
    const { dir, env } = await project({ a: 'Cached one', b: 'Cached two' });
    await capture(() => runUpdate({ cwd: dir, env, yes: true, quiet: true, pollIntervalMs: 1 }));
    await rm(join(dir, 'messages/fr.json'));
    let seen: { chars: number; grossChars?: number } | null = null;
    const { out } = await capture(() =>
      runUpdate({ cwd: dir, env, yes: true, pollIntervalMs: 1, confirmPlan: async (i) => ((seen = i.estimate), true) }),
    );
    expect(seen).toMatchObject({ chars: 0, grossChars: 20, memoryChars: 20, perLocale: { fr: { chars: 0, texts: 0, memoryHits: 2 } } });
    expect(formatGrossVsCache(seen!)).toBe('20 chars gross → 0 after cache (20 already translated, not billed)');
    expect(out).toContain('Done');
  });

  it('empty source text: empty target + lock entry locally, never sent', async () => {
    const { dir, env } = await project({ 'homeCompare.h0': '', 'homeCompare.h1': 'Compare' });
    const e0 = mock.state.estimates.length;
    const t0 = mock.state.translateBodies.length;
    await capture(() => runUpdate({ cwd: dir, env, yes: true, quiet: true, pollIntervalMs: 1, confirmPlan: async () => true }));
    const sent = [...mock.state.estimates.slice(e0), ...mock.state.translateBodies.slice(t0)].flatMap((b) => b.items.map((i) => i.key));
    expect(sent).not.toContain('homeCompare.h0');
    expect(sent).toContain('homeCompare.h1');
    const de = JSON.parse(await readFile(join(dir, 'messages/de.json'), 'utf8'));
    expect(de['homeCompare.h0'] ?? de.homeCompare?.h0).toBe('');
    const lock = JSON.parse(await readFile(join(dir, 'tongue.lock'), 'utf8'));
    expect(JSON.stringify(lock)).toContain(sha(''));
    // second run: nothing planned
    let planned = -1;
    await capture(() => runUpdate({ cwd: dir, env, yes: true, quiet: true, pollIntervalMs: 1, confirmPlan: async (i) => ((planned = i.plan.length), true) }));
    expect(planned).toBe(0);
  });
});

describe('1.0.4 helpers', () => {
  it('canonical glossary is byte-identical regardless of order', () => {
    const a = canonicalGlossary({ terms: { B: { note: 'x', de: 'b' }, A: { doNotTranslate: true } } });
    const b = canonicalGlossary({ terms: { A: { doNotTranslate: true }, B: { de: 'b', note: 'x' } } });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('empty source with empty target is not "missing"', () => {
    const lock = { version: 1, localEdits: [] } as never;
    expect(diffCatalogs({ source: { e: '' }, targets: { de: { e: '' } }, lock, locales: ['de'] }).plan).toEqual([]);
    expect(diffCatalogs({ source: { e: '' }, targets: { de: {} }, lock, locales: ['de'] }).plan).toHaveLength(1);
  });
  it('aggregates gross / memory / perLocale across per-locale estimates', () => {
    const base = { billableChars: 0, costGBP: 0, currency: 'GBP', allowanceRemaining: null, withinAllowance: false } as const;
    const e = aggregateEstimates([
      { ...base, chars: 10, grossChars: 30, memoryChars: 20, perLocale: { de: { chars: 10, texts: 1, memoryHits: 2 } } },
      { ...base, chars: 5, grossChars: 5, memoryChars: 0, perLocale: { fr: { chars: 5, texts: 1, memoryHits: 0 } } },
    ] as Estimate[]);
    expect(e).toMatchObject({ chars: 15, grossChars: 35, memoryChars: 20, perLocale: { de: { memoryHits: 2 }, fr: { memoryHits: 0 } } });
    expect(formatGrossVsCache({ chars: 7 })).toBe('7 chars to translate');
  });
  it('plan line and resume split', () => {
    expect(estimatePlanLine({ plan: new Array(3), alreadyTranslated: 1200, empty: 0 }).replaceAll(String.fromCharCode(27), '').replace(/\[\d+m/g, '')).toBe('3 keys need translation · 1,200 already translated');
    expect(formatResumeSplit(new Map([['de', { resumed: 120, fresh: 479 }], ['fr', { resumed: 0, fresh: 599 }], ['it', { resumed: 599, fresh: 0 }]]))).toBe(
      'resumed from the interrupted run vs newly translated: de 120 resumed + 479 new · fr 599 new · it 599 resumed',
    );
  });
});
