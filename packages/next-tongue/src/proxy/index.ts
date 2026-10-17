import type { LocaleCookieConfig } from '../config/types.js';

/** Minimal request shape satisfied by NextRequest (proxy / middleware). */
export type TongueProxyRequest = {
  url: string;
  nextUrl: {
    pathname: string;
    clone: () => {
      pathname: string;
      href: string;
      toString: () => string;
    };
  };
  cookies: {
    get: (name: string) => { value: string } | undefined;
  };
  headers: {
    get: (name: string) => string | null;
  };
};

export type CreateProxyOptions = {
  locales: readonly string[];
  defaultLocale: string;
  prefix?: 'always' | 'as-needed' | 'never';
  localeDetection?: boolean;
  localeCookie?: LocaleCookieConfig | false;
  /** Override detection (cookie → Accept-Language → default). */
  resolveLocale?: (
    req: TongueProxyRequest,
  ) => string | undefined | Promise<string | undefined>;
  onLocale?: (locale: string, req: TongueProxyRequest) => void;
};

const DEFAULT_COOKIE: LocaleCookieConfig = {
  name: 'TONGUE_LOCALE',
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax',
  path: '/',
};

/**
 * Next.js 16 `proxy.ts` handler for locale prefix routing.
 * Returns standard `Response` objects (compatible with Next proxy/middleware).
 *
 * @see docs/routing-and-proxy.md
 */
export function createProxy(options: CreateProxyOptions): (
  req: TongueProxyRequest,
) => Response | Promise<Response> {
  const locales = [...options.locales];
  const defaultLocale = options.defaultLocale;
  const prefix = options.prefix ?? 'as-needed';
  const localeDetection = options.localeDetection !== false;
  const cookieCfg =
    options.localeCookie === false
      ? false
      : { ...DEFAULT_COOKIE, ...(options.localeCookie ?? {}) };

  const localeSet = new Set(locales);
  if (!localeSet.has(defaultLocale)) {
    throw new Error(
      `[next-tongue] createProxy: defaultLocale "${defaultLocale}" is not in locales`,
    );
  }

  return async (req: TongueProxyRequest) => {
    const { pathname } = req.nextUrl;

    if (isUnsafePath(pathname)) {
      return passthrough(cookieCfg, null);
    }

    const matched = matchLocalePrefix(pathname, localeSet);

    if (matched) {
      const { locale, rest } = matched;

      if (prefix === 'as-needed' && locale === defaultLocale) {
        const dest = rest === '' ? '/' : rest;
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = dest;
        options.onLocale?.(locale, req);
        return redirectResponse(redirectUrl.toString(), 308, cookieCfg, locale);
      }

      options.onLocale?.(locale, req);
      return passthrough(cookieCfg, locale);
    }

    let locale =
      (options.resolveLocale
        ? await options.resolveLocale(req)
        : undefined) ??
      (localeDetection
        ? detectLocale(req, locales, defaultLocale, cookieCfg)
        : defaultLocale);

    if (!localeSet.has(locale)) locale = defaultLocale;
    options.onLocale?.(locale, req);

    if (prefix === 'never') {
      const url = req.nextUrl.clone();
      url.pathname = joinLocalePath(locale, pathname);
      return rewriteResponse(url.toString(), cookieCfg, locale);
    }

    if (prefix === 'as-needed' && locale === defaultLocale) {
      const url = req.nextUrl.clone();
      url.pathname = joinLocalePath(defaultLocale, pathname);
      return rewriteResponse(url.toString(), cookieCfg, locale);
    }

    const url = req.nextUrl.clone();
    url.pathname = joinLocalePath(locale, pathname);
    return redirectResponse(url.toString(), 307, cookieCfg, locale);
  };
}

/** Exported for tests. */
export function matchLocalePrefix(
  pathname: string,
  locales: Set<string> | readonly string[],
): { locale: string; rest: string } | null {
  const set = locales instanceof Set ? locales : new Set(locales);
  const segments = pathname.split('/');
  const maybe = segments[1];
  if (!maybe || !set.has(maybe)) return null;
  const restParts = segments.slice(2);
  const rest = restParts.length ? `/${restParts.join('/')}` : '';
  return { locale: maybe, rest };
}

/** Exported for tests. */
export function isUnsafePath(pathname: string): boolean {
  if (pathname.includes('//')) return true;
  if (pathname.includes('\\')) return true;
  try {
    const decoded = decodeURIComponent(pathname);
    if (decoded.includes('//') || decoded.startsWith('//')) return true;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)) return true;
  } catch {
    return true;
  }
  return false;
}

/** Exported for tests. */
export function parseAcceptLanguage(
  header: string | null,
  locales: readonly string[],
): string | undefined {
  if (!header) return undefined;
  const parts = header.split(',').map((p) => {
    const [tag, ...params] = p.trim().split(';');
    let q = 1;
    for (const param of params) {
      const m = /q\s*=\s*([\d.]+)/i.exec(param);
      if (m) q = Number(m[1]);
    }
    return { tag: (tag ?? '').toLowerCase(), q };
  });
  parts.sort((a, b) => b.q - a.q);
  for (const { tag } of parts) {
    if (!tag || tag === '*') continue;
    const exact = locales.find((l) => l.toLowerCase() === tag);
    if (exact) return exact;
    const lang = tag.split('-')[0]!;
    const prefixMatch = locales.find(
      (l) => l.toLowerCase() === lang || l.toLowerCase().startsWith(`${lang}-`),
    );
    if (prefixMatch) return prefixMatch;
  }
  return undefined;
}

function detectLocale(
  req: TongueProxyRequest,
  locales: readonly string[],
  defaultLocale: string,
  cookieCfg: LocaleCookieConfig | false,
): string {
  if (cookieCfg) {
    const raw = req.cookies.get(cookieCfg.name)?.value;
    if (raw && locales.includes(raw)) return raw;
  }
  const fromHeader = parseAcceptLanguage(
    req.headers.get('accept-language'),
    locales,
  );
  return fromHeader ?? defaultLocale;
}

function joinLocalePath(locale: string, pathname: string): string {
  if (pathname === '/' || pathname === '') return `/${locale}`;
  return `/${locale}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function cookieHeader(
  locale: string,
  cookieCfg: LocaleCookieConfig,
): string {
  const parts = [
    `${cookieCfg.name}=${encodeURIComponent(locale)}`,
    `Path=${cookieCfg.path ?? '/'}`,
    `Max-Age=${cookieCfg.maxAge}`,
    `SameSite=${capitalizeSameSite(cookieCfg.sameSite ?? 'lax')}`,
  ];
  if (cookieCfg.secure) parts.push('Secure');
  return parts.join('; ');
}

function capitalizeSameSite(s: 'lax' | 'strict' | 'none'): string {
  if (s === 'lax') return 'Lax';
  if (s === 'strict') return 'Strict';
  return 'None';
}

function withCookie(
  headers: Headers,
  cookieCfg: LocaleCookieConfig | false,
  locale: string | null,
): Headers {
  if (cookieCfg && locale) {
    headers.append('Set-Cookie', cookieHeader(locale, cookieCfg));
  }
  return headers;
}

function passthrough(
  cookieCfg: LocaleCookieConfig | false,
  locale: string | null,
): Response {
  const headers = withCookie(new Headers({ 'x-middleware-next': '1' }), cookieCfg, locale);
  return new Response(null, { status: 200, headers });
}

function redirectResponse(
  location: string,
  status: 307 | 308,
  cookieCfg: LocaleCookieConfig | false,
  locale: string,
): Response {
  const headers = withCookie(new Headers({ Location: location }), cookieCfg, locale);
  return new Response(null, { status, headers });
}

function rewriteResponse(
  url: string,
  cookieCfg: LocaleCookieConfig | false,
  locale: string,
): Response {
  const headers = withCookie(
    new Headers({ 'x-middleware-rewrite': url }),
    cookieCfg,
    locale,
  );
  return new Response(null, { status: 200, headers });
}
