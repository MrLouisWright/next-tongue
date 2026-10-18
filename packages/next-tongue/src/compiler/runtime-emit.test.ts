import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolveConfig } from '../config/validate.js';
import { buildMessages } from './build.js';
import { getT, getLocales, localeParams } from '../server/index.js';

describe('generated runtime.js', () => {
  it('ensureTongue wires getT and localeParams', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-rt-'));
    await mkdir(join(dir, 'messages'));
    await writeFile(
      join(dir, 'messages', 'en.json'),
      JSON.stringify({ home: { hi: 'Hi {name}' } }),
    );
    await writeFile(
      join(dir, 'messages', 'de.json'),
      JSON.stringify({ home: { hi: 'Hallo {name}' } }),
    );

    const config = resolveConfig({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      messages: './messages/{locale}.json',
    });
    await buildMessages({ config, cwd: dir });

    const runtimePath = join(dir, '.tongue', 'runtime.js');
    const src = await readFile(runtimePath, 'utf8');
    expect(src).toContain('ensureTongue');
    expect(src).toMatch(/ensureTongue\(\);\s*$/m);
    expect(src).toContain('export const prefix');
    expect(src).toContain('export const routing');
    expect(src).toContain("from './ns/home.js'");

    // Load generated runtime in Node (rewrite next-tongue/server import to our package)
    const serverUrl = pathToFileURL(
      join(fileURLToPath(new URL('.', import.meta.url)), '../server/index.js'),
    ).href;
    const rewritten = src.replace(
      "from 'next-tongue/server'",
      `from ${JSON.stringify(serverUrl)}`,
    );
    const tmp = join(dir, '.tongue', 'runtime.load.js');
    await writeFile(tmp, rewritten);
    const mod = (await import(pathToFileURL(tmp).href)) as {
      ensureTongue: () => void;
      locales: string[];
      localeParams: () => { locale: string }[];
    };
    mod.ensureTongue();
    expect(getLocales()).toEqual(['en', 'de']);
    expect(localeParams()).toEqual([{ locale: 'en' }, { locale: 'de' }]);
    const t = await getT('de', 'home');
    expect(t('hi', { name: 'Ada' })).toBe('Hallo Ada');
  });
});
