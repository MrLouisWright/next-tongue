import { describe, expect, it } from 'vitest';
import { transformNextIntl } from './migrate.js';

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
    expect(notes.some((n) => n.includes('useT'))).toBe(true);
  });

  it('rewrites explicit getTranslations({ locale, namespace })', () => {
    const src = `const t = await getTranslations({ locale, namespace: 'home' });`;
    const { text } = transformNextIntl(src, 's.ts');
    expect(text).toContain("await getT(locale, 'home')");
  });

  it('flags bare getTranslations with TODO', () => {
    const src = `const t = await getTranslations('home');`;
    const { text, notes } = transformNextIntl(src, 's.ts');
    expect(text).toContain('TODO(tongue)');
    expect(notes.some((n) => n.includes('needs locale'))).toBe(true);
  });

  it('removes setRequestLocale', () => {
    const src = `setRequestLocale(locale);\nconst x = 1;\n`;
    const { text } = transformNextIntl(src, 's.ts');
    expect(text).not.toContain('setRequestLocale');
    expect(text).toContain('const x = 1');
  });
});
