import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConfig } from '../../config/validate.js';
import { validateA11y } from './a11y.js';
import { checkMessageBidi, validateBidi } from './bidi.js';

describe('validateA11y', () => {
  it('flags missing lang/dir on locale layout', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-a11y-'));
    await mkdir(join(dir, 'app/[locale]'), { recursive: true });
    await writeFile(
      join(dir, 'app/[locale]/layout.tsx'),
      `export default function L({ children }) { return <html><body>{children}</body></html>; }\n`,
    );
    const config = resolveConfig({
      locales: ['en', 'ar'],
      defaultLocale: 'en',
      strict: { a11y: 'error', unused: 'off', missing: 'off' },
    });
    const issues = await validateA11y(config, dir);
    expect(issues.some((i) => i.message.includes('lang'))).toBe(true);
    expect(issues.some((i) => i.message.includes('dir'))).toBe(true);
  });

  it('passes when lang and getDir are present', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-a11y-ok-'));
    await mkdir(join(dir, 'app/[locale]'), { recursive: true });
    await writeFile(
      join(dir, 'app/[locale]/layout.tsx'),
      `export default function L({ children, locale }) {
  return <html lang={locale} dir={getDir(locale)}><body>{children}</body></html>;
}\n`,
    );
    const config = resolveConfig({
      locales: ['en', 'ar'],
      defaultLocale: 'en',
      strict: { a11y: 'error', unused: 'off' },
    });
    const issues = await validateA11y(config, dir);
    expect(issues).toHaveLength(0);
  });

  it('accepts lang/dir on root layout when [locale] is nested', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-a11y-root-'));
    await mkdir(join(dir, 'app/[locale]'), { recursive: true });
    await writeFile(
      join(dir, 'app/layout.tsx'),
      `export default function Root({ children }) {
  return <html lang="en" dir="ltr"><body>{children}</body></html>;
}\n`,
    );
    await writeFile(
      join(dir, 'app/[locale]/layout.tsx'),
      `export default function L({ children }) { return children; }\n`,
    );
    const config = resolveConfig({
      locales: ['en', 'ar'],
      defaultLocale: 'en',
      strict: { a11y: 'error', unused: 'off' },
    });
    const issues = await validateA11y(config, dir);
    expect(issues).toHaveLength(0);
  });

  it('accepts HtmlLang client sync on root layout', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-a11y-html-lang-'));
    await mkdir(join(dir, 'app/[locale]'), { recursive: true });
    await writeFile(
      join(dir, 'app/layout.tsx'),
      `import { HtmlLang } from './html-lang';
export default function Root({ children }) {
  return <html><body><HtmlLang />{children}</body></html>;
}\n`,
    );
    await writeFile(
      join(dir, 'app/[locale]/layout.tsx'),
      `export default function L({ children }) { return children; }\n`,
    );
    const config = resolveConfig({
      locales: ['en', 'ar'],
      defaultLocale: 'en',
      strict: { a11y: 'error', unused: 'off' },
    });
    const issues = await validateA11y(config, dir);
    expect(issues).toHaveLength(0);
  });
});

describe('checkMessageBidi', () => {
  it('detects unbalanced controls', () => {
    const issues = checkMessageBidi(`Hello \u202B world`, {
      fullKey: 'home.t',
      locale: 'ar',
      file: 'messages/ar.json',
      rtl: true,
      severity: 'warn',
    });
    expect(issues.some((i) => i.message.includes('Unbalanced'))).toBe(true);
  });

  it('flags LTR punctuation around args in RTL', () => {
    const issues = checkMessageBidi(`({name})`, {
      fullKey: 'home.t',
      locale: 'he',
      file: 'messages/he.json',
      rtl: true,
      severity: 'warn',
    });
    expect(issues.some((i) => i.message.includes('FSI'))).toBe(true);
  });

  it('accepts FSI-wrapped args', () => {
    const issues = checkMessageBidi(`(\u2068{name}\u2069)`, {
      fullKey: 'home.t',
      locale: 'fa',
      file: 'messages/fa.json',
      rtl: true,
      severity: 'warn',
    });
    expect(issues).toHaveLength(0);
  });
});

describe('validateBidi fixtures ar/he/fa', () => {
  it('reports issues on fixture messages', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-bidi-'));
    await mkdir(join(dir, 'messages'));
    await writeFile(
      join(dir, 'messages/en.json'),
      JSON.stringify({ home: { t: 'Hello {name}' } }),
    );
    await writeFile(
      join(dir, 'messages/ar.json'),
      JSON.stringify({ home: { t: '({name})' } }),
    );
    await writeFile(
      join(dir, 'messages/he.json'),
      JSON.stringify({ home: { t: 'שלום \u202B' } }),
    );
    await writeFile(
      join(dir, 'messages/fa.json'),
      JSON.stringify({ home: { t: '\u2068{name}\u2069' } }),
    );
    const config = resolveConfig({
      locales: ['en', 'ar', 'he', 'fa'],
      defaultLocale: 'en',
      messages: './messages/{locale}.json',
      strict: { bidi: 'warn', unused: 'off', missing: 'off', a11y: 'off' },
    });
    const issues = await validateBidi(config, dir);
    expect(issues.some((i) => i.locale === 'ar')).toBe(true);
    expect(issues.some((i) => i.locale === 'he')).toBe(true);
    expect(issues.some((i) => i.locale === 'fa')).toBe(false);
  });
});
