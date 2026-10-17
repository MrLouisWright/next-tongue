import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  createLocaleMatcher,
  buildLocaleMatcherTables,
  localeParentChain,
  matchTagAgainstTables,
} from './locale-matcher.js';
import { createProxy, type TongueProxyRequest } from './index.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('locale matcher tables (#18)', () => {
  it('exact and language best-fit', () => {
    const tables = buildLocaleMatcherTables(['en', 'de', 'zh-Hant', 'pt-BR']);
    expect(matchTagAgainstTables('de-DE', tables)).toBe('de');
    expect(matchTagAgainstTables('zh-Hant-HK', tables)).toBe('zh-Hant');
    expect(matchTagAgainstTables('pt', tables)).toBe('pt-BR');
    expect(matchTagAgainstTables('fr', tables)).toBeUndefined();
  });

  it('parent chain walks most-specific first', () => {
    expect(localeParentChain('zh-Hant-HK')).toEqual([
      'zh-hant-hk',
      'zh-hant',
      'zh',
    ]);
  });

  it('LRU caches Accept-Language results', () => {
    const matcher = createLocaleMatcher(['en', 'de'], { cacheSize: 2 });
    expect(matcher.match('de,en;q=0.8')).toBe('de');
    expect(matcher.match('de,en;q=0.8')).toBe('de');
    expect(matcher.match('fr')).toBeUndefined();
    expect(matcher.match('en')).toBe('en');
  });

  it('constructs no Intl.* objects while matching', () => {
    const NumberFormat = vi.spyOn(Intl, 'NumberFormat');
    const DateTimeFormat = vi.spyOn(Intl, 'DateTimeFormat');
    const PluralRules = vi.spyOn(Intl, 'PluralRules');
    const Collator = vi.spyOn(Intl, 'Collator');
    const DisplayNames =
      typeof Intl.DisplayNames === 'function'
        ? vi.spyOn(Intl, 'DisplayNames')
        : null;
    const Locale =
      typeof Intl.Locale === 'function' ? vi.spyOn(Intl, 'Locale') : null;

    const locales = Array.from({ length: 150 }, (_, i) => `l${i}`);
    locales[0] = 'en';
    locales[1] = 'de';
    const matcher = createLocaleMatcher(locales);
    for (let i = 0; i < 200; i++) {
      matcher.match(`de-DE,en;q=0.8,fr;q=0.5`);
      matcher.match(`l${i % 150},en;q=0.1`);
    }

    expect(NumberFormat).not.toHaveBeenCalled();
    expect(DateTimeFormat).not.toHaveBeenCalled();
    expect(PluralRules).not.toHaveBeenCalled();
    expect(Collator).not.toHaveBeenCalled();
    if (DisplayNames) expect(DisplayNames).not.toHaveBeenCalled();
    if (Locale) expect(Locale).not.toHaveBeenCalled();
  });
});

describe('createProxy + matcher', () => {
  function req(path: string, acceptLanguage?: string): TongueProxyRequest {
    const href = `http://localhost${path}`;
    const url = new URL(href);
    return {
      url: href,
      nextUrl: {
        get pathname() {
          return url.pathname;
        },
        clone() {
          const c = new URL(url.href);
          return {
            get pathname() {
              return c.pathname;
            },
            set pathname(v: string) {
              c.pathname = v;
            },
            get href() {
              return c.href;
            },
            toString() {
              return c.href;
            },
          };
        },
      },
      cookies: { get: () => undefined },
      headers: {
        get(name) {
          return name.toLowerCase() === 'accept-language'
            ? (acceptLanguage ?? null)
            : null;
        },
      },
    };
  }

  it('uses injected localeMatcher', async () => {
    const matcher = createLocaleMatcher(['en', 'de']);
    const proxy = createProxy({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      prefix: 'always',
      localeMatcher: matcher,
    });
    const res = await proxy(req('/about', 'de-CH,en;q=0.5'));
    expect(res.headers.get('location')).toBe('http://localhost/de/about');
  });
});
