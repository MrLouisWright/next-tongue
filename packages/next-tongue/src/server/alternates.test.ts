import { describe, expect, it } from 'vitest';
import {
  createGenerateAlternates,
  generateAlternates,
} from './alternates.js';

/** Google reciprocal rule: every language URL's alternate set is the same. */
function assertReciprocal(languages: Record<string, string>) {
  expect(languages['x-default']).toBeTruthy();
  const localeKeys = Object.keys(languages).filter((k) => k !== 'x-default');
  expect(localeKeys.length).toBeGreaterThan(1);
  const urls = new Set(Object.values(languages));
  // Every locale key maps to a URL; x-default shares a locale URL
  expect(urls.has(languages['x-default']!)).toBe(true);
  for (const loc of localeKeys) {
    expect(languages[loc]).toMatch(/^\//);
  }
}

describe('generateAlternates (#13)', () => {
  const base = {
    locales: ['en', 'de'] as const,
    defaultLocale: 'en',
    pathnames: { '/about': { de: '/ueber-uns' } },
  };

  it('as-needed: canonical + languages + x-default', () => {
    const alt = generateAlternates({
      ...base,
      href: '/about',
      locale: 'de',
      prefix: 'as-needed',
    });
    expect(alt.canonical).toBe('/de/ueber-uns');
    expect(alt.languages).toEqual({
      en: '/about',
      de: '/de/ueber-uns',
      'x-default': '/about',
    });
    assertReciprocal(alt.languages);
  });

  it('always: prefixes every locale', () => {
    const alt = generateAlternates({
      ...base,
      href: '/about',
      locale: 'en',
      prefix: 'always',
    });
    expect(alt.canonical).toBe('/en/about');
    expect(alt.languages.en).toBe('/en/about');
    expect(alt.languages.de).toBe('/de/ueber-uns');
    expect(alt.languages['x-default']).toBe('/en/about');
  });

  it('domains produce absolute reciprocal URLs', () => {
    const alt = generateAlternates({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      href: '/about',
      locale: 'en',
      prefix: 'as-needed',
      pathnames: { '/about': { de: '/ueber-uns' } },
      domains: [
        { domain: 'example.com', defaultLocale: 'en', locales: ['en'] },
        { domain: 'example.de', defaultLocale: 'de', locales: ['de'] },
      ],
    });
    expect(alt.canonical).toBe('https://example.com/about');
    expect(alt.languages).toEqual({
      en: 'https://example.com/about',
      de: 'https://example.de/ueber-uns',
      'x-default': 'https://example.com/about',
    });
    // Reciprocal: both absolute URLs appear in the map
    expect(new Set(Object.values(alt.languages)).size).toBe(2);
  });

  it('createGenerateAlternates binds config', () => {
    const gen = createGenerateAlternates({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      prefix: 'as-needed',
    });
    const alt = gen({ href: '/', locale: 'de' });
    expect(alt.canonical).toBe('/de');
    expect(alt.languages['x-default']).toBe('/');
  });
});
