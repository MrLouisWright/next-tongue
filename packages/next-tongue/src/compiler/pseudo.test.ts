import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveConfig } from '../config/validate.js';
import { parseMessage } from './parse/icu-parser.js';
import { buildMessages } from './build.js';
import { pseudoLocalizeAst, pseudoLocalizeString } from './pseudo.js';
import { formatMessage, configureFormatMessage } from '../runtime/format-message.js';

describe('pseudoLocalizeString', () => {
  it('accents letters, expands, and wraps in brackets', () => {
    const out = pseudoLocalizeString('Settings', { expand: 0.35 });
    expect(out.startsWith('[')).toBe(true);
    expect(out.endsWith(']')).toBe(true);
    expect(out).toContain('Š');
    expect(out.length).toBeGreaterThan('Settings'.length + 2);
  });
});

describe('pseudoLocalizeAst', () => {
  it('preserves ICU args, plurals, and tags', () => {
    const ast = parseMessage(
      'Hello {name}, <b>{count, plural, one {# item} other {# items}}</b>',
    );
    const pseudo = pseudoLocalizeAst(ast, { expand: 0.35 });
    const arg = pseudo.find((e) => e.type === 'argument');
    expect(arg && arg.type === 'argument' && arg.name).toBe('name');
    const tag = pseudo.find((e) => e.type === 'tag');
    expect(tag && tag.type === 'tag' && tag.name).toBe('b');
    if (tag && tag.type === 'tag') {
      const plural = tag.children.find((e) => e.type === 'plural');
      expect(plural?.type).toBe('plural');
      if (plural && plural.type === 'plural') {
        const other = plural.options.find((o) => o.selector === 'other');
        const lit = other?.value.find((e) => e.type === 'literal');
        expect(lit && lit.type === 'literal' && lit.value.includes('íţéḿ')).toBe(
          true,
        );
      }
    }
  });
});

describe('codegen pseudo locale (#36)', () => {
  it('emits en-XA from defaultLocale and excludes it from production locales', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-pseudo-'));
    await mkdir(join(dir, 'messages'));
    await writeFile(
      join(dir, 'messages', 'en.json'),
      JSON.stringify({ home: { title: 'Hello {name}' } }),
    );
    await writeFile(
      join(dir, 'messages', 'de.json'),
      JSON.stringify({ home: { title: 'Hallo {name}' } }),
    );

    const config = resolveConfig({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      messages: './messages/{locale}.json',
      pseudo: true,
    });
    const result = await buildMessages({ config, cwd: dir, idempotent: false });
    expect(result.locales).toEqual(['en', 'de', 'en-XA']);

    const mod = await import(
      pathToFileURL(join(dir, '.tongue/msg/home/title.js')).href
    );
    expect(mod.title('en', { name: 'Ada' })).toBe('Hello Ada');
    const xa = mod.title('en-XA', { name: 'Ada' }) as string;
    expect(xa).toContain('Ada');
    expect(xa.startsWith('[')).toBe(true);
    expect(xa).not.toBe('Hello Ada');

    const runtime = await readFile(join(dir, '.tongue/runtime.js'), 'utf8');
    expect(runtime).toContain('allLocales');
    expect(runtime).toContain("process.env.NODE_ENV === 'production'");
    expect(runtime).toContain('configureFormatMessage');
  });
});

describe('formatMessage + pseudo', () => {
  it('accents when locale matches configured pseudo locale', () => {
    configureFormatMessage({
      pseudo: { locale: 'en-XA', expand: 0.35 },
    });
    const out = formatMessage('en-XA', 'Hello {name}', { name: 'Ada' });
    expect(out).toContain('Ada');
    expect(out.startsWith('[')).toBe(true);
    expect(formatMessage('en', 'Hello {name}', { name: 'Ada' })).toBe(
      'Hello Ada',
    );
  });
});
