import { describe, expect, it } from 'vitest';
import { hasLocaleInScope, transformNextIntl } from './migrate.js';

describe('transformNextIntl (#31)', () => {
  it('rewrites useTranslations and client imports', () => {
    const src = `
import { useTranslations } from 'next-intl';
export function X() {
  const t = useTranslations('home');
  return t('title');
}
`;
    const { text, notes } = transformNextIntl(src, 'x.tsx');
    expect(text).toContain("from 'next-tongue/client'");
    expect(text).toContain("useT('home')");
    expect(text).not.toContain('useTranslations');
    expect(notes.some((n) => n.description.includes('useT'))).toBe(true);
  });

  it('rewrites explicit getTranslations({ locale, namespace })', () => {
    const src = `const t = await getTranslations({ locale, namespace: 'home' });`;
    const { text } = transformNextIntl(src, 's.ts');
    expect(text).toContain("await getT(locale, 'home')");
  });

  it('threads locale when in scope', () => {
    const src = `
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations('home');
  return t('title');
}
`;
    const { text, notes } = transformNextIntl(src, 'page.tsx');
    expect(text).toContain("await getT(locale, 'home')");
    expect(text).not.toContain('TODO(tongue)');
    expect(notes.some((n) => n.kind === 'rewrite' && n.description.includes('locale in scope'))).toBe(
      true,
    );
  });

  it('flags bare getTranslations with TODO when locale missing', () => {
    const src = `const t = await getTranslations('home');`;
    const { text, notes } = transformNextIntl(src, 's.ts');
    expect(text).toContain('TODO(tongue)');
    expect(notes.some((n) => n.kind === 'todo')).toBe(true);
  });

  it('removes setRequestLocale', () => {
    const src = `setRequestLocale(locale);\nconst x = 1;\n`;
    const { text } = transformNextIntl(src, 's.ts');
    expect(text).not.toContain('setRequestLocale');
    expect(text).toContain('const x = 1');
  });

  it('rewrites createNextIntlPlugin', () => {
    const src = `import createNextIntlPlugin from 'next-intl/plugin';\nconst withNextIntl = createNextIntlPlugin();\n`;
    const { text } = transformNextIntl(src, 'next.config.ts');
    expect(text).toContain('withTongue');
    expect(text).toContain('next-tongue/next');
  });
});

describe('hasLocaleInScope', () => {
  it('detects destructured locale', () => {
    expect(hasLocaleInScope('const { locale } = await params;')).toBe(true);
    expect(hasLocaleInScope('export function f() { return 1 }')).toBe(false);
  });
});
