import { describe, expect, it } from 'vitest';
import { getPathname, stripLocalePrefix } from './pathname.js';

describe('getPathname', () => {
  it('as-needed omits default locale prefix', () => {
    expect(
      getPathname({
        href: '/about',
        locale: 'en',
        prefix: 'as-needed',
        defaultLocale: 'en',
      }),
    ).toBe('/about');
    expect(
      getPathname({
        href: '/about',
        locale: 'de',
        prefix: 'as-needed',
        defaultLocale: 'en',
      }),
    ).toBe('/de/about');
  });

  it('always prefixes every locale', () => {
    expect(
      getPathname({
        href: '/about',
        locale: 'en',
        prefix: 'always',
        defaultLocale: 'en',
      }),
    ).toBe('/en/about');
  });

  it('applies localized pathnames', () => {
    expect(
      getPathname({
        href: '/about',
        locale: 'de',
        prefix: 'always',
        defaultLocale: 'en',
        pathnames: { '/about': { de: '/ueber-uns' } },
      }),
    ).toBe('/de/ueber-uns');
  });

  it('interpolates params and query', () => {
    expect(
      getPathname({
        href: { pathname: '/blog/[slug]', params: { slug: 'a' }, query: { page: 2 } },
        locale: 'en',
        prefix: 'always',
        defaultLocale: 'en',
      }),
    ).toBe('/en/blog/a?page=2');
  });
});

describe('stripLocalePrefix', () => {
  it('removes known locale segment', () => {
    expect(stripLocalePrefix('/de/about', ['en', 'de'])).toBe('/about');
    expect(stripLocalePrefix('/en', ['en', 'de'])).toBe('/');
    expect(stripLocalePrefix('/about', ['en', 'de'])).toBe('/about');
  });
});
