import { describe, expect, it } from 'vitest';
import { extractFromSource } from './scan-keys.js';

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

  it('harvests string arrays when t(variable) is used', () => {
    const { refs, dynamicNamespaces } = extractFromSource(
      `
      const t = await getT(locale, 'home');
      const KEYS = ['title', 'body'] as const;
      return KEYS.map((key) => t(key));
      `,
      'page.tsx',
    );
    expect(dynamicNamespaces.has('home')).toBe(true);
    expect(refs.map((r) => r.fullKey).sort()).toEqual([
      'home.body',
      'home.title',
    ]);
  });
});
