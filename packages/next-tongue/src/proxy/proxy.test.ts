import { describe, expect, it } from 'vitest';
import {
  createProxy,
  isUnsafePath,
  matchLocalePrefix,
  mergeProxyResponse,
  parseAcceptLanguage,
  sanitizeLocale,
  signLocalePreference,
  verifyLocalePreference,
  type TongueProxyRequest,
} from './index.js';

function req(
  path: string,
  init?: {
    acceptLanguage?: string;
    cookie?: string;
    https?: boolean;
    host?: string;
  },
): TongueProxyRequest {
  const host = init?.host ?? 'localhost';
  const href = `${init?.https ? 'https' : 'http'}://${host}${path}`;
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
    cookies: {
      get(name) {
        if (!init?.cookie) return undefined;
        const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(init.cookie);
        return m ? { value: decodeURIComponent(m[1]!) } : undefined;
      },
    },
    headers: {
      get(name) {
        const n = name.toLowerCase();
        if (n === 'accept-language') return init?.acceptLanguage ?? null;
        if (n === 'host') return host;
        return null;
      },
    },
  };
}

describe('matchLocalePrefix', () => {
  const locales = new Set(['en', 'de', 'fr']);
  it('extracts locale and rest', () => {
    expect(matchLocalePrefix('/en/about', locales)).toEqual({
      locale: 'en',
      rest: '/about',
    });
    expect(matchLocalePrefix('/de', locales)).toEqual({ locale: 'de', rest: '' });
  });
  it('returns null when no prefix', () => {
    expect(matchLocalePrefix('/about', locales)).toBeNull();
    expect(matchLocalePrefix('/', locales)).toBeNull();
  });
});

describe('isUnsafePath', () => {
  it('rejects protocol-relative and encoded tricks', () => {
    expect(isUnsafePath('//evil.com')).toBe(true);
    expect(isUnsafePath('/%2F%2Fevil.com')).toBe(true);
    expect(isUnsafePath('/about')).toBe(false);
    expect(isUnsafePath('/de/blog/v1.2')).toBe(false);
  });
});

describe('parseAcceptLanguage', () => {
  it('picks best match', () => {
    expect(parseAcceptLanguage('de-DE,de;q=0.9,en;q=0.8', ['en', 'de'])).toBe(
      'de',
    );
    expect(parseAcceptLanguage('fr-CA,fr;q=0.9', ['en', 'de'])).toBeUndefined();
    expect(parseAcceptLanguage('en-US,en;q=0.9', ['en', 'de'])).toBe('en');
  });
});

describe('createProxy', () => {
  const base = {
    locales: ['en', 'de'] as const,
    defaultLocale: 'en',
  };

  it('prefix always: redirects bare path to /{locale}/…', async () => {
    const proxy = createProxy({
      ...base,
      prefix: 'always',
      localeDetection: false,
    });
    const res = await proxy(req('/about'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/en/about');
  });

  it('prefix as-needed: rewrites default locale without exposing prefix', async () => {
    const proxy = createProxy({
      ...base,
      prefix: 'as-needed',
      localeDetection: false,
    });
    const res = await proxy(req('/about'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-rewrite')).toContain('/en/about');
  });

  it('prefix as-needed: 308 /en/about → /about', async () => {
    const proxy = createProxy({ ...base, prefix: 'as-needed' });
    const res = await proxy(req('/en/about'));
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('http://localhost/about');
  });

  it('uses Accept-Language when no cookie', async () => {
    const proxy = createProxy({ ...base, prefix: 'always' });
    const res = await proxy(req('/about', { acceptLanguage: 'de,en;q=0.8' }));
    expect(res.headers.get('location')).toBe('http://localhost/de/about');
  });

  it('does not open-redirect on //evil.com', async () => {
    const proxy = createProxy({ ...base, prefix: 'always' });
    const res = await proxy(req('//evil.com'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('sets TONGUE_LOCALE cookie by default', async () => {
    const proxy = createProxy({
      ...base,
      prefix: 'always',
      localeDetection: false,
    });
    const res = await proxy(req('/about'));
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/TONGUE_LOCALE=en/);
    expect(setCookie.toLowerCase()).toMatch(/samesite=lax/);
  });

  it('prefers cookie over Accept-Language', async () => {
    const proxy = createProxy({ ...base, prefix: 'always' });
    const res = await proxy(
      req('/about', {
        acceptLanguage: 'de',
        cookie: 'TONGUE_LOCALE=en',
      }),
    );
    expect(res.headers.get('location')).toBe('http://localhost/en/about');
  });

  it('ignores spoofed cookie locales (traversal / injection)', async () => {
    const proxy = createProxy({ ...base, prefix: 'always' });
    for (const bad of ['../en', 'en%0d%0a', 'en\r\n', 'fr', 'en/../../x']) {
      const res = await proxy(
        req('/about', {
          acceptLanguage: 'de',
          cookie: `TONGUE_LOCALE=${bad}`,
        }),
      );
      // falls back to Accept-Language → de
      expect(res.headers.get('location')).toBe('http://localhost/de/about');
    }
  });

  it('honours localeCookie sameSite/secure/path', async () => {
    const proxy = createProxy({
      ...base,
      prefix: 'always',
      localeDetection: false,
      localeCookie: {
        name: 'TONGUE_LOCALE',
        maxAge: 60,
        sameSite: 'strict',
        secure: true,
        path: '/app',
      },
    });
    const res = await proxy(req('/about'));
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/Path=\/app/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    expect(setCookie).toMatch(/Secure/);
  });

  it('defaults Secure on HTTPS and omits it on HTTP (#19)', async () => {
    const proxy = createProxy({
      ...base,
      prefix: 'always',
      localeDetection: false,
    });
    const httpRes = await proxy(req('/about'));
    expect(httpRes.headers.get('set-cookie') ?? '').not.toMatch(/Secure/i);
    const httpsRes = await proxy(req('/about', { https: true }));
    expect(httpsRes.headers.get('set-cookie') ?? '').toMatch(/Secure/);
  });

  it('never detects excluded pseudo locales (#36)', async () => {
    const proxy = createProxy({
      locales: ['en', 'de', 'en-XA'],
      defaultLocale: 'en',
      prefix: 'always',
      excludeFromDetection: ['en-XA'],
    });
    const fromCookie = await proxy(
      req('/about', { cookie: 'TONGUE_LOCALE=en-XA', acceptLanguage: 'de' }),
    );
    expect(fromCookie.headers.get('location')).toBe('http://localhost/de/about');
    const fromHeader = await proxy(
      req('/about', { acceptLanguage: 'en-XA,fr;q=0.8' }),
    );
    // en-XA is skipped; may fall back to en via language prefix, never to en-XA
    expect(fromHeader.headers.get('location')).not.toContain('/en-XA/');
    expect(fromHeader.headers.get('location')).toBe('http://localhost/en/about');
    // Explicit URL prefix still works
    const direct = await proxy(req('/en-XA/about'));
    expect(direct.status).toBe(200);
  });

  it('prefix never: rewrites bare path to /{locale}/… (#32)', async () => {
    const proxy = createProxy({
      ...base,
      prefix: 'never',
      localeDetection: false,
    });
    const res = await proxy(req('/about'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-rewrite')).toBe(
      'http://localhost/en/about',
    );
  });

  it('pathnames: rewrites localized public URL to internal (#32)', async () => {
    const proxy = createProxy({
      ...base,
      prefix: 'always',
      pathnames: { '/about': { de: '/ueber-uns' } },
    });
    const res = await proxy(req('/de/ueber-uns'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-rewrite')).toBe(
      'http://localhost/de/about',
    );
  });

  it('pathnames: redirects bare internal path to localized prefix (#32)', async () => {
    const proxy = createProxy({
      ...base,
      prefix: 'always',
      localeDetection: false,
      resolveLocale: async () => 'de',
      pathnames: { '/about': { de: '/ueber-uns' } },
    });
    const res = await proxy(req('/about'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/de/ueber-uns');
  });

  it('resolveLocale from signed preference (#48)', async () => {
    const secret = 'proxy-test-secret';
    const value = await signLocalePreference('de', secret);
    const proxy = createProxy({
      ...base,
      prefix: 'always',
      localeDetection: false,
      resolveLocale: (r) =>
        verifyLocalePreference(r.cookies.get('TONGUE_PREF')?.value, secret),
    });
    const res = await proxy(req('/', { cookie: `TONGUE_PREF=${value}` }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/de');
  });

  it('domains: uses per-host default locale (#32)', async () => {
    const proxy = createProxy({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      prefix: 'always',
      localeDetection: false,
      domains: [
        { domain: 'example.com', defaultLocale: 'en', locales: ['en'] },
        { domain: 'example.de', defaultLocale: 'de', locales: ['de'] },
      ],
    });
    const res = await proxy(req('/about', { host: 'example.de' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://example.de/de/about');
  });
});

describe('sanitizeLocale', () => {
  it('rejects traversal, encoding, and unknown tags', () => {
    expect(sanitizeLocale('en', ['en', 'de'])).toBe('en');
    expect(sanitizeLocale('../en', ['en'])).toBeUndefined();
    expect(sanitizeLocale('en%2e%2e', ['en'])).toBeUndefined();
    expect(sanitizeLocale('en\0', ['en'])).toBeUndefined();
    expect(sanitizeLocale('fr', ['en', 'de'])).toBeUndefined();
  });
});

describe('mergeProxyResponse', () => {
  it('keeps CSP from prior next() while preserving tongue rewrite', () => {
    const prior = new Response(null, {
      status: 200,
      headers: {
        'x-middleware-next': '1',
        'content-security-policy': "script-src 'nonce-abc'",
        'x-nonce': 'abc',
      },
    });
    const tongue = new Response(null, {
      status: 200,
      headers: {
        'x-middleware-rewrite': 'http://localhost/en/about',
        'set-cookie': 'TONGUE_LOCALE=en; Path=/',
      },
    });
    const merged = mergeProxyResponse(prior, tongue);
    expect(merged.headers.get('x-middleware-rewrite')).toBe(
      'http://localhost/en/about',
    );
    expect(merged.headers.get('x-middleware-next')).toBeNull();
    expect(merged.headers.get('content-security-policy')).toBe(
      "script-src 'nonce-abc'",
    );
    expect(merged.headers.get('x-nonce')).toBe('abc');
    expect(merged.headers.get('set-cookie')).toContain('TONGUE_LOCALE');
  });
});

describe('createProxy wrapResponse', () => {
  it('runs wrapResponse on the final response', async () => {
    const proxy = createProxy({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      prefix: 'always',
      wrapResponse(res) {
        const headers = new Headers(res.headers);
        headers.set('content-security-policy', "default-src 'self'");
        return new Response(res.body, { status: res.status, headers });
      },
    });
    const res = await proxy(req('/about'));
    expect(res.status).toBe(307);
    expect(res.headers.get('content-security-policy')).toBe(
      "default-src 'self'",
    );
  });
});
