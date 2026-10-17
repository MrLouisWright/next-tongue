import { describe, expect, it } from 'vitest';
import { extractFromSource, stripComments } from './scan-keys.js';

describe('extractFromSource', () => {
  it('finds literal t(key) under getT/useT', () => {
    const { refs } = extractFromSource(
      `
      const t = await getT(locale, 'home');
      return t('title');
      `,
      'page.tsx',
    );
    expect(refs.map((r) => r.fullKey)).toContain('home.title');
  });

  it('ignores t(key) inside comments', () => {
    const { refs } = extractFromSource(
      `
      const t = await getT(locale, 'home');
      // t('commented')
      /* t('block') */
      return t('title');
      `,
      'page.tsx',
    );
    expect(refs.map((r) => r.fullKey)).toEqual(['home.title']);
  });

  it('marks t.dynamic from: keys as used', () => {
    const { refs, dynamicNamespaces } = extractFromSource(
      `
      const t = useT('status');
      t.dynamic(status, { from: ['open', 'closed'] });
      `,
      'c.tsx',
    );
    expect(refs.map((r) => r.fullKey).sort()).toEqual([
      'status.closed',
      'status.open',
    ]);
    expect(dynamicNamespaces.has('status')).toBe(true);
  });

  it('does not treat unrelated string arrays as missing keys', () => {
    const { refs, dynamicNamespaces } = extractFromSource(
      `
      const t = await getT(locale, 'home');
      const tags = ['taxonomy', 'sort'] as const;
      return KEYS.map((key) => t(key));
      `,
      'page.tsx',
    );
    expect(dynamicNamespaces.has('home')).toBe(true);
    // no false "taxonomy" / "sort" undefined refs
    expect(refs.map((r) => r.fullKey)).not.toContain('home.taxonomy');
    expect(refs.map((r) => r.fullKey)).not.toContain('home.sort');
  });

  it('stripComments preserves strings with //', () => {
    expect(stripComments(`const u = "https://x"; // trail\n`)).toContain(
      'https://x',
    );
    expect(stripComments(`const u = "https://x"; // trail\n`)).not.toContain(
      'trail',
    );
  });
});
