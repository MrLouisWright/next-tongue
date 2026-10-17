import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConfig } from '../config/validate.js';
import { buildMessages } from './build.js';
import {
  assertSourceShape,
  duplicateSourceKeys,
  loadAndMergeSources,
} from './sources.js';
import { loadLocaleMessages } from './load-messages.js';

describe('assertSourceShape', () => {
  it('rejects bad shapes', () => {
    expect(() => assertSourceShape(null, '0')).toThrow(/TONGUE_E_CONFIG|must return/);
    expect(() => assertSourceShape({ en: { home: { t: 1 } } }, '0')).toThrow();
  });
});

describe('loadAndMergeSources', () => {
  it('merges after files and later sources win', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-src-'));
    await mkdir(join(dir, 'messages'));
    await writeFile(
      join(dir, 'messages/en.json'),
      JSON.stringify({ home: { title: 'File', body: 'Body' } }),
    );
    await writeFile(
      join(dir, 'messages/de.json'),
      JSON.stringify({ home: { title: 'Datei', body: 'Körper' } }),
    );
    const config = resolveConfig({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      messages: './messages/{locale}.json',
      sources: [
        async () => ({
          en: { home: { title: 'Source1', hero: 'Hero' } },
          de: { home: { title: 'Quelle1', hero: 'Held' } },
        }),
        async () => ({
          en: { home: { title: 'Source2' } },
          de: { home: { title: 'Quelle2' } },
        }),
      ],
    });
    const files = await loadLocaleMessages(config, dir);
    const { catalogs, origins } = await loadAndMergeSources(config, dir, files);
    expect(catalogs.en?.home?.title).toBe('Source2');
    expect(catalogs.en?.home?.hero).toBe('Hero');
    expect(catalogs.en?.home?.body).toBe('Body');
    expect(duplicateSourceKeys(origins)).toContain('home.title');
  });

  it('use-cache reuses sources.json on failure', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-src-cache-'));
    await mkdir(join(dir, 'messages'));
    await mkdir(join(dir, '.tongue'), { recursive: true });
    await writeFile(
      join(dir, 'messages/en.json'),
      JSON.stringify({ home: { title: 'Hello' } }),
    );
    await writeFile(
      join(dir, 'messages/de.json'),
      JSON.stringify({ home: { title: 'Hallo' } }),
    );
    await writeFile(
      join(dir, '.tongue/sources.json'),
      JSON.stringify([
        { en: { home: { cached: 'From cache' } }, de: { home: { cached: 'Aus Cache' } } },
      ]),
    );
    let calls = 0;
    const config = resolveConfig({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      messages: './messages/{locale}.json',
      sourcesOnError: 'use-cache',
      sources: [
        async () => {
          calls++;
          throw new Error('CMS down');
        },
      ],
    });
    const files = await loadLocaleMessages(config, dir);
    const { catalogs, usedCache } = await loadAndMergeSources(config, dir, files);
    expect(usedCache).toBe(true);
    expect(calls).toBe(1);
    expect(catalogs.en?.home?.cached).toBe('From cache');
  });
});

describe('buildMessages with sources', () => {
  it('compiles sourced keys into types', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-src-build-'));
    await mkdir(join(dir, 'messages'));
    await writeFile(
      join(dir, 'messages/en.json'),
      JSON.stringify({ home: { title: 'Hi' } }),
    );
    await writeFile(
      join(dir, 'messages/de.json'),
      JSON.stringify({ home: { title: 'Hallo' } }),
    );
    const config = resolveConfig({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      messages: './messages/{locale}.json',
      sources: [
        async () => ({
          en: { marketing: { hero: 'Hello {name}' } },
          de: { marketing: { hero: 'Hallo {name}' } },
        }),
      ],
    });
    const result = await buildMessages({ config, cwd: dir, idempotent: false });
    expect(result.keyCount).toBe(2);
    const types = await readFile(join(dir, '.tongue/types.d.ts'), 'utf8');
    expect(types).toContain('marketing');
    expect(types).toContain('hero');
    const cache = await readFile(join(dir, '.tongue/sources.json'), 'utf8');
    expect(cache).toContain('Hello {name}');
  });
});
