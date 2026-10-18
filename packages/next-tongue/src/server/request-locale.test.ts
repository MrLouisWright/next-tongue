import { describe, expect, it } from 'vitest';
import {
  LOCALE_COOKIE_NAME,
  LOCALE_HEADER_NAME,
  requestLocale,
} from './request-locale.js';

const locales = ['en', 'de', 'fr'] as const;

function req(init: {
  header?: string;
  cookie?: string;
}): Parameters<typeof requestLocale>[0] {
  return {
    headers: {
      get: (name) =>
        name.toLowerCase() === LOCALE_HEADER_NAME && init.header
          ? init.header
          : null,
    },
    cookies: {
      get: (name) =>
        name === LOCALE_COOKIE_NAME && init.cookie
          ? { value: init.cookie }
          : undefined,
    },
  };
}

describe('requestLocale', () => {
  it('prefers x-locale header over cookie', () => {
    expect(
      requestLocale(req({ header: 'de', cookie: 'fr' }), {
        locales,
        defaultLocale: 'en',
      }),
    ).toBe('de');
  });

  it('falls back to TONGUE_LOCALE cookie then default', () => {
    expect(
      requestLocale(req({ cookie: 'fr' }), {
        locales,
        defaultLocale: 'en',
      }),
    ).toBe('fr');
    expect(
      requestLocale(req({}), { locales, defaultLocale: 'en' }),
    ).toBe('en');
  });

  it('ignores unknown locales', () => {
    expect(
      requestLocale(req({ header: 'xx', cookie: 'yy' }), {
        locales,
        defaultLocale: 'en',
      }),
    ).toBe('en');
  });
});
