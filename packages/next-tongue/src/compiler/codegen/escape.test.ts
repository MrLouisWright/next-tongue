import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveConfig } from '../../config/validate.js';
import { buildMessages } from '../build.js';

describe('codegen escapes message content (#46)', () => {
  it('embeds quotes, newlines, and backticks as safe string literals', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-esc-'));
    await mkdir(join(dir, 'messages'));
    // Avoid raw `<…>` — those parse as rich tags and pull `.tongue/rich.js`.
    // source → expected runtime string (ICU apostrophe-escape for braces).
    const cases: Array<[string, string]> = [
      [`He said "hello"`, `He said "hello"`],
      [`line1\nline2`, `line1\nline2`],
      ['with `backticks`', 'with `backticks`'],
      ['</' + 'script>alert(1)', '</' + 'script>alert(1)'],
      [`\\u0022`, `\\u0022`],
      [`it''s a test`, `it's a test`], // ICU: '' → literal '
      [`$'{process.exit(1)}'`, '${process.exit(1)}'],
    ];
    const en: Record<string, string> = {};
    for (let i = 0; i < cases.length; i++) en[`k${i}`] = cases[i]![0];
    await writeFile(join(dir, 'messages', 'en.json'), JSON.stringify({ x: en }));

    const config = resolveConfig({
      locales: ['en'],
      defaultLocale: 'en',
      messages: './messages/{locale}.json',
    });
    await buildMessages({ config, cwd: dir, idempotent: false });

    for (let i = 0; i < cases.length; i++) {
      const [, expected] = cases[i]!;
      const mod = await import(
        pathToFileURL(join(dir, `.tongue/msg/x/k${i}.js`)).href
      );
      const fn = mod[`k${i}`] as (locale: string) => string;
      expect(fn('en')).toBe(expected);
      const src = await readFile(join(dir, `.tongue/msg/x/k${i}.js`), 'utf8');
      // Must not contain raw unescaped script breakouts as executable JS
      expect(src).not.toMatch(/[^\\]"\s*;\s*alert/);
    }
  });
});
