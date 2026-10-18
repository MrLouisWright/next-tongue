import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConfig } from '../config/validate.js';
import { validateUsage } from './validate/usage.js';
import {
  collectUnusedIgnores,
  isUnusedIgnored,
  matchesUnusedIgnoreGlob,
} from './unused-meta.js';

describe('collectUnusedIgnores', () => {
  it('reads planned / @tongue-ignore / ignoreUnused on key$meta', () => {
    const index = collectUnusedIgnores({
      common: {
        seeAll: 'See all',
        seeAll$meta: { planned: true },
        soon: 'Soon',
        soon$meta: { '@tongue-ignore': true },
        keep: 'Keep',
        keep$meta: { ignoreUnused: true },
        wired: 'Wired',
      },
    });
    expect(isUnusedIgnored('common.seeAll', index)).toBe(true);
    expect(isUnusedIgnored('common.soon', index)).toBe(true);
    expect(isUnusedIgnored('common.keep', index)).toBe(true);
    expect(isUnusedIgnored('common.wired', index)).toBe(false);
  });

  it('reads namespace $meta.planned', () => {
    const index = collectUnusedIgnores({
      drafts: {
        $meta: { planned: true },
        a: 'A',
        b: 'B',
      },
      live: { title: 'T' },
    });
    expect(isUnusedIgnored('drafts.a', index)).toBe(true);
    expect(isUnusedIgnored('drafts.b', index)).toBe(true);
    expect(isUnusedIgnored('live.title', index)).toBe(false);
  });

  it('matches unusedIgnore globs', () => {
    expect(matchesUnusedIgnoreGlob('common.seeAll', ['common.*'])).toBe(true);
    expect(matchesUnusedIgnoreGlob('home.seeAll', ['*.seeAll'])).toBe(true);
    expect(matchesUnusedIgnoreGlob('home.title', ['common.*'])).toBe(false);
  });
});

describe('validateUsage + $meta planned', () => {
  it('does not warn unused for planned keys', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-planned-'));
    await mkdir(join(dir, 'messages'));
    await mkdir(join(dir, 'app'), { recursive: true });
    await writeFile(
      join(dir, 'messages', 'en.json'),
      JSON.stringify({
        home: {
          title: 'Hi',
          title$meta: { description: 'used' },
          reserved: 'Later',
          reserved$meta: { planned: true, description: 'not wired yet' },
        },
      }),
    );
    await writeFile(
      join(dir, 'app', 'page.tsx'),
      `const t = await getT(locale, 'home');\nreturn t('title');\n`,
    );
    const config = resolveConfig({
      locales: ['en'],
      defaultLocale: 'en',
      messages: './messages/{locale}.json',
      strict: { unused: 'warn', missing: 'off', a11y: 'off' },
    });
    const issues = await validateUsage(config, dir);
    const unused = issues.filter((i) => i.check === 'unused');
    expect(unused.map((i) => i.key)).toEqual([]);
  });
});
