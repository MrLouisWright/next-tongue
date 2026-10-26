import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockLoomlocale } from '../../scripts/mock-loomlocale.mjs';
import { LoomlocaleClient } from './api.js';
import { createCredentialStore, credentialsFile } from './credentials.js';
import { readCatalog, swapLocale, writeCatalog, parseDictionary, serializeDictionary, detectLayouts } from './dictionaries.js';
import { upsertCloudBlock } from './project.js';
import { runUpdate } from '../cli/update.js';
import { cmdLink, cmdLogin, cmdPull, cmdStatus, cmdWhoami } from '../cli/cloud.js';
import { runWizard } from '../cli/wizard.js';
import { createLinePrompter } from './tui.js';

const mock = createMockLoomlocale({ projects: [{ id: 'prj_1', name: 'demo', sourceLocale: 'en', targetLocales: ['de'] }] });
let baseURL = '';
beforeAll(async () => {
  baseURL = await mock.listen();
});
afterAll(() => mock.close());

async function tmp(): Promise<{ dir: string; env: NodeJS.ProcessEnv }> {
  const dir = await mkdtemp(join(tmpdir(), 'tongue-cloud-'));
  const env = { LOOMLOCALE_NO_KEYCHAIN: '1', LOOMLOCALE_NO_BROWSER: '1', XDG_CONFIG_HOME: join(dir, '.cfg'), LOOMLOCALE_API_URL: baseURL };
  return { dir, env };
}

async function project(extra = '', en: Record<string, unknown> = { home: { title: 'Hello, {name}!', body: 'Welcome <b>back</b>' } }) {
  const t = await tmp();
  await mkdir(join(t.dir, 'messages'));
  await writeFile(join(t.dir, 'messages/en.json'), JSON.stringify(en));
  await writeFile(
    join(t.dir, 'tongue.config.mjs'),
    `export default {\n  locales: ['en', 'de', 'fr'],\n  defaultLocale: 'en',\n  messages: './messages/{locale}.json',\n  ${extra}\n};\n`,
  );
  return { ...t, env: { ...t.env, LOOMLOCALE_TOKEN: 'llt_test' } };
}
const quiet = { quiet: true, pollIntervalMs: 1 } as const;

describe('api client', () => {
  it('sends bearer auth and surfaces 401 with a login hint', async () => {
    await expect(new LoomlocaleClient({ baseURL, token: 'nope' }).me()).rejects.toThrow(/401.*tongue login/);
    const me = await new LoomlocaleClient({ baseURL, token: 'llt_test' }).me();
    expect(me.plan.paygPerMillionGBP).toBe(25);
  });
  it('refuses authed calls without a token', async () => {
    await expect(new LoomlocaleClient({ baseURL }).listProjects()).rejects.toThrow(/Not logged in/);
  });
});

describe('credentials', () => {
  it('falls back to a 0600 file when the keychain is disabled', async () => {
    const { env } = await tmp();
    const store = createCredentialStore(env);
    expect(await store.set('https://x', 'secret')).toBe('file');
    expect(await store.get('https://x')).toBe('secret');
    expect((await stat(credentialsFile(env))).mode & 0o777).toBe(0o600);
    await store.delete('https://x');
    expect(await store.get('https://x')).toBeNull();
  });
});

describe('dictionaries', () => {
  it('reads per-locale folders and TS dictionaries, writes mirrored files', async () => {
    const { dir } = await tmp();
    await mkdir(join(dir, 'locales/en'), { recursive: true });
    await writeFile(join(dir, 'locales/en/home.json'), JSON.stringify({ title: 'Hi', nav: { a: 'A' } }));
    await writeFile(join(dir, 'locales/en/auth.ts'), `import type { X } from './x';\nexport default {\n  // comment\n  login: 'Log in',\n} satisfies X;\n`);
    const src = await readCatalog(dir, ['./locales/{locale}/*.json', './locales/{locale}/*.ts'], 'en');
    expect(src.flat).toEqual({ 'home.title': 'Hi', 'home.nav.a': 'A', 'auth.login': 'Log in' });
    await writeCatalog({ cwd: dir, source: src, sourceLocale: 'en', locale: 'de', set: { 'home.title': 'Hallo', 'auth.login': 'Anmelden' }, remove: [] });
    expect(JSON.parse(await readFile(join(dir, 'locales/de/home.json'), 'utf8'))).toEqual({ title: 'Hallo' });
    const ts = await readFile(join(dir, 'locales/de/auth.ts'), 'utf8');
    expect(ts).toContain('satisfies X;');
    expect(ts).toContain('"login": "Anmelden"');
    expect((await detectLayouts(dir)).map((l) => l.pattern)).toContain('./locales/{locale}/*.json');
  });
  it('swapLocale and round trip', () => {
    expect(swapLocale('messages/en.json', 'en', 'de')).toBe('messages/de.json');
    expect(swapLocale('locales/en/en-things.json', 'en', 'de')).toBe('locales/de/en-things.json');
    const shape = parseDictionary('export default { a: "x" } as const;\n', 'a.ts');
    expect(serializeDictionary(shape)).toBe('export default {\n  "a": "x"\n} as const;\n');
  });
  it('upsertCloudBlock inserts and replaces', () => {
    const a = upsertCloudBlock("export default defineConfig({\n  locales: ['en'],\n});", { projectId: 'p1' });
    expect(a).toContain('cloud: {\n    projectId: "p1",\n  },');
    expect(upsertCloudBlock(a, { projectId: 'p2' })).toContain('"p2"');
    expect(upsertCloudBlock(a, { projectId: 'p2' })).not.toContain('"p1"');
  });
});

describe('tongue update', () => {
  it('--dry-run makes zero network calls', async () => {
    const p = await project(`cloud: { projectId: 'prj_1' },`);
    const before = mock.state.requests.length;
    const s = await runUpdate({ cwd: p.dir, env: p.env, dryRun: true, ...quiet });
    expect(mock.state.requests.length).toBe(before);
    expect(s.plan.length).toBe(4);
  });

  it('translates new keys, validates placeholders, then only changed/deleted keys', async () => {
    const p = await project(`cloud: { projectId: 'prj_1' },`);
    const s1 = await runUpdate({ cwd: p.dir, env: p.env, ...quiet });
    expect(s1.translated).toBe(4);
    const de = JSON.parse(await readFile(join(p.dir, 'messages/de.json'), 'utf8'));
    expect(de.home.title).toBe('[de] Hello, {name}!');
    expect(de.home.body).toBe('[de] Welcome <b>back</b>');
    const lock = JSON.parse(await readFile(join(p.dir, 'tongue.lock'), 'utf8'));
    expect(lock.$cloud.projectId).toBe('prj_1');
    expect(JSON.stringify(lock)).not.toContain('llt_test');

    // change one key, delete one
    await writeFile(join(p.dir, 'messages/en.json'), JSON.stringify({ home: { title: 'Hi, {name}!' } }));
    const s2 = await runUpdate({ cwd: p.dir, env: p.env, ...quiet });
    expect(s2.plan.map((x) => `${x.locale}:${x.key}:${x.reason}`).sort()).toEqual(['de:home.title:changed', 'fr:home.title:changed']);
    expect(s2.removed).toBe(2);
    const de2 = JSON.parse(await readFile(join(p.dir, 'messages/de.json'), 'utf8'));
    expect(de2).toEqual({ home: { title: '[de] Hi, {name}!' } });
    const s3 = await runUpdate({ cwd: p.dir, env: p.env, ...quiet });
    expect(s3.plan.length).toBe(0);
  });

  it('keeps human edits and pulls web edits; conflicts need --prefer in CI', async () => {
    const p = await project(`cloud: { projectId: 'prj_1' },`);
    await runUpdate({ cwd: p.dir, env: p.env, ...quiet });
    const { sha } = await import('./engine.js');
    // web edit on fr, untouched locally → applied
    mock.state.webEdits.push({ key: 'home.title', locale: 'fr', text: 'Bonjour, {name} !', sourceHash: sha('Hello, {name}!'), origin: 'web' });
    const s = await runUpdate({ cwd: p.dir, env: p.env, ci: true, ...quiet });
    expect(s.pulled).toBe(1);
    expect(JSON.parse(await readFile(join(p.dir, 'messages/fr.json'), 'utf8')).home.title).toBe('Bonjour, {name} !');
    // local + web edit on de → conflict
    const dePath = join(p.dir, 'messages/de.json');
    const de = JSON.parse(await readFile(dePath, 'utf8'));
    de.home.title = 'Hallo lokal, {name}!';
    await writeFile(dePath, JSON.stringify(de));
    mock.state.webEdits.push({ key: 'home.title', locale: 'de', text: 'Hallo web, {name}!', sourceHash: sha('Hello, {name}!'), origin: 'web' });
    await expect(runUpdate({ cwd: p.dir, env: p.env, ci: true, ...quiet })).rejects.toThrow(/--prefer/);
    mock.state.webEdits.push({ key: 'home.title', locale: 'de', text: 'Hallo web, {name}!', sourceHash: sha('Hello, {name}!'), origin: 'web' });
    await runUpdate({ cwd: p.dir, env: p.env, ci: true, prefer: 'remote', ...quiet });
    expect(JSON.parse(await readFile(dePath, 'utf8')).home.title).toBe('Hallo web, {name}!');
  });

  it('rejects translations that break ICU args', async () => {
    const m2 = createMockLoomlocale({ projects: [{ id: 'prj_1', name: 'x', sourceLocale: 'en', targetLocales: [] }], breakKeys: ['home.title'] });
    const url = await m2.listen();
    const p = await project(`cloud: { projectId: 'prj_1' },`);
    const prev = process.exitCode;
    const s = await runUpdate({ cwd: p.dir, env: { ...p.env, LOOMLOCALE_API_URL: url }, locale: 'de', ...quiet });
    process.exitCode = prev;
    await m2.close();
    expect(s.failed.map((f) => f.key)).toEqual(['home.title']);
    expect(s.translated).toBe(1);
  });

  it('enforces maxChars and requires a linked project', async () => {
    const p = await project(`translate: { maxChars: 10 }, cloud: { projectId: 'prj_1' },`);
    await expect(runUpdate({ cwd: p.dir, env: p.env, ...quiet })).rejects.toThrow(/Spending cap exceeded/);
    const q = await project();
    await expect(runUpdate({ cwd: q.dir, env: q.env, ...quiet })).rejects.toThrow(/tongue link/);
  });

  it('rejects legacy BYO-key config with a migration hint', async () => {
    const p = await project(`translate: { apiKeyEnv: 'TONGUE_API_KEY' },`);
    await expect(runUpdate({ cwd: p.dir, env: p.env, ...quiet })).rejects.toThrow(/removed in next-tongue 1.0/);
  });
});

describe('account commands', () => {
  it('device login stores the token; whoami, link, status, pull work', async () => {
    const { dir, env } = await tmp();
    await mkdir(join(dir, 'messages'));
    await writeFile(join(dir, 'messages/en.json'), JSON.stringify({ a: 'A' }));
    await writeFile(join(dir, 'tongue.config.mjs'), `export default {\n  locales: ['en', 'de'],\n  defaultLocale: 'en',\n};\n`);
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => logs.push(a.join(' '));
    try {
      await cmdLogin({ env, noBrowser: true, sleep: async () => {} });
      expect(logs.join('\n')).toContain('ABCD-EFGH');
      expect(await createCredentialStore(env).get(baseURL)).toBe('llt_test');
      const me = await cmdWhoami({ env, quiet: true });
      expect(me.user.email).toBe('dev@example.com');
      await cmdLink({ cwd: dir, env, create: 'new-app', quiet: true });
      expect(await readFile(join(dir, 'tongue.config.mjs'), 'utf8')).toMatch(/projectId: "prj_\d+"/);
      const prev = process.exitCode;
      await cmdStatus({ cwd: dir, env, json: true });
      process.exitCode = prev;
      expect(logs.some((l) => l.includes('"new":1'))).toBe(true);
      expect(await cmdPull({ cwd: dir, env, quiet: true })).toBe(0);
    } finally {
      console.log = orig;
    }
  });
});

describe('wizard', () => {
  it('detects folders, logs in, creates project, estimates and translates', async () => {
    const { dir, env } = await tmp();
    await writeFile(join(dir, 'package.json'), JSON.stringify({ dependencies: { vite: '6' } }));
    await mkdir(join(dir, 'locales/en'), { recursive: true });
    await writeFile(join(dir, 'locales/en/common.json'), JSON.stringify({ hi: 'Hi {n}' }));
    const orig = console.log;
    const logs: string[] = [];
    console.log = (...a: unknown[]) => logs.push(a.join(' '));
    const write = process.stdout.write;
    process.stdout.write = ((s: string) => (logs.push(String(s)), true)) as typeof process.stdout.write;
    try {
      await runWizard({
        cwd: dir,
        env,
        noBrowser: true,
        sleep: async () => {},
        pollIntervalMs: 1,
        // source, files, targets, login?, project (__new__ = create), name, confirm
        prompter: createLinePrompter(['en', '1', 'de,ja', 'y', '__new__', 'wizard-app', 'y']),
      });
    } catch (e) {
      console.log = orig;
      process.stdout.write = write;
      throw new Error(String(e) + logs.join('') + (await readFile(join(dir, 'tongue.config.mjs'), 'utf8')));
    } finally {
      console.log = orig;
      process.stdout.write = write;
    }
    const out = logs.join('\n');
    if (!out.includes('All set')) throw new Error(out + await readFile(join(dir, 'tongue.config.mjs'), 'utf8'));
    expect(out).toContain('Vite');
    expect(out).toMatch(/£0\.00|Estimated cost/);
    expect(JSON.parse(await readFile(join(dir, 'locales/ja/common.json'), 'utf8'))).toEqual({ hi: '[ja] Hi {n}' });
    const cfg = await readFile(join(dir, 'tongue.config.mjs'), 'utf8');
    expect(cfg).toContain('./locales/{locale}/*.json');
    expect(cfg).toMatch(/projectId/);
  });
});
