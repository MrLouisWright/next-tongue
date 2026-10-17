import { describe, expect, it } from 'vitest';
import { buildLocaleSwitcherOptions } from './locale-switcher.js';

describe('buildLocaleSwitcherOptions (#44)', () => {
  const config = {
    locales: ['en', 'de'] as const,
    defaultLocale: 'en',
    prefix: 'as-needed' as const,
    pathnames: { '/about': { de: '/ueber-uns' } },
  };

  it('keeps the page across locales with localized pathnames', () => {
    const opts = buildLocaleSwitcherOptions(config, {
      locale: 'de',
      pathname: '/de/ueber-uns',
    });
    expect(opts).toEqual([
      {
        locale: 'en',
        label: expect.any(String),
        // Prefixed so proxy can set the en cookie before 308 → /about
        href: '/en/about',
        current: false,
        hreflang: 'en',
      },
      {
        locale: 'de',
        label: expect.any(String),
        href: '/de/ueber-uns',
        current: true,
        hreflang: 'de',
      },
    ]);
    expect(opts[0]!.label.toLowerCase()).toMatch(/english|englisch/);
    expect(opts[1]!.label.toLowerCase()).toMatch(/deutsch|german/);
  });

  it('labels each locale in its own language', () => {
    const opts = buildLocaleSwitcherOptions(
      { locales: ['en', 'fr'], defaultLocale: 'en', prefix: 'always' },
      { locale: 'en', pathname: '/en' },
    );
    expect(opts[0]!.label).toMatch(/English/i);
    expect(opts[1]!.label).toMatch(/français/i);
  });
});
