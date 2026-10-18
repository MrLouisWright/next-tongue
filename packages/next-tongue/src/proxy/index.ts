import type { DomainConfig, LocaleCookieConfig } from '../config/types.js';
import { toInternalPathname } from '../navigation/pathname.js';
import {
  createLocaleMatcher,
  type LocaleMatcher,
  type LocaleMatcherTables,
} from './locale-matcher.js';

export {
  createLocaleMatcher,
  buildLocaleMatcherTables,
  emitLocaleMatcherModule,
  localeParentChain,
  matchTagAgainstTables,
} from './locale-matcher.js';
export type { LocaleMatcher, LocaleMatcherTables };

export {
  verifyLocalePreference,
  signLocalePreference,
  timingSafeEqual,
  DEFAULT_PREF_COOKIE,
} from '../runtime/locale-preference.js';

export type { DomainConfig };

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
  /** Localized pathnames: internal → { locale: public path } (#32). */
  pathnames?: Record<string, Partial<Record<string, string>>>;
  /** Per-host default locale / allow-list (#32). */
  domains?: DomainConfig[];
  /**
   * Never selected by cookie / Accept-Language (e.g. `en-XA`).
   * Still routable when the URL already has the prefix (#36).
   */
  excludeFromDetection?: readonly string[];
  /**
   * Precomputed matcher (from codegen or `createLocaleMatcher`).
   * Built once from `locales` when omitted (#18).
   */
  localeMatcher?: LocaleMatcher;
  /** Override detection (domain → cookie → Accept-Language → default). */
  resolveLocale?: (
    req: TongueProxyRequest,
  ) => string | undefined | Promise<string | undefined>;
  onLocale?: (locale: string, req: TongueProxyRequest) => void;
  /**
   * Post-process every tongue response (redirect / rewrite / next).
   * Use to re-stamp CSP / nonce headers after locale routing — tongue does
   * not preserve headers from a prior `NextResponse.next()`.
   */
  wrapResponse?: (
    res: Response,
    req: TongueProxyRequest,
  ) => Response | Promise<Response>;
};

/** Default locale cookie name (`SameSite=Lax`). Use with `requestLocale` in API routes. */
export const LOCALE_COOKIE_NAME = 'TONGUE_LOCALE';

const DEFAULT_COOKIE: LocaleCookieConfig = {
  name: LOCALE_COOKIE_NAME,
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
  const pathnames = options.pathnames;
  const domains = options.domains;
  const cookieCfg =
    options.localeCookie === false
      ? false
      : { ...DEFAULT_COOKIE, ...(options.localeCookie ?? {}) };
  const excludeDetection = new Set(options.excludeFromDetection ?? []);
  const baseMatcher = options.localeMatcher ?? createLocaleMatcher(locales);
  // Matcher for detection excludes pseudo locales without rebuilding Intl.
  const detectionLocales = locales.filter((l) => !excludeDetection.has(l));
  const detectionMatcher =
    detectionLocales.length === locales.length
      ? baseMatcher
      : createLocaleMatcher(detectionLocales);

  const localeSet = new Set(locales);
  if (!localeSet.has(defaultLocale)) {
    throw new Error(
      `[next-tongue] createProxy: defaultLocale "${defaultLocale}" is not in locales`,
    );
  }

  const wrap = options.wrapResponse;

  return async (req: TongueProxyRequest) => {
    const res = await handleProxyRequest(req, {
      locales,
      defaultLocale,
      prefix,
      localeDetection,
      pathnames,
      domains,
      cookieCfg,
      excludeDetection,
      localeSet,
      detectionMatcher,
      options,
    });
    return wrap ? await wrap(res, req) : res;
  };
}

type ProxyHandleCtx = {
  locales: string[];
  defaultLocale: string;
  prefix: 'always' | 'as-needed' | 'never';
  localeDetection: boolean;
  pathnames: CreateProxyOptions['pathnames'];
  domains: CreateProxyOptions['domains'];
  cookieCfg: LocaleCookieConfig | false;
  excludeDetection: Set<string>;
  localeSet: Set<string>;
  detectionMatcher: LocaleMatcher;
  options: CreateProxyOptions;
};

async function handleProxyRequest(
  req: TongueProxyRequest,
  ctx: ProxyHandleCtx,
): Promise<Response> {
  const {
    locales,
    defaultLocale,
    prefix,
    localeDetection,
    pathnames,
    domains,
    cookieCfg,
    excludeDetection,
    localeSet,
    detectionMatcher,
    options,
  } = ctx;
  const { pathname } = req.nextUrl;
  const https = isHttpsRequest(req);

  if (isUnsafePath(pathname)) {
    return passthrough(cookieCfg, null, https);
  }

  const domain = matchDomain(req, domains);
  const activeLocales = domain?.locales ? [...domain.locales] : locales;
  const activeDefault = domain?.defaultLocale ?? defaultLocale;
  const activeSet = new Set(activeLocales);
  const activeMatcher =
    activeLocales.length === locales.length
      ? detectionMatcher
      : createLocaleMatcher(
          activeLocales.filter((l) => !excludeDetection.has(l)),
        );

  const matched = matchLocalePrefix(pathname, localeSet);

  if (matched && (!domain || activeSet.has(matched.locale))) {
    const { locale, rest } = matched;
    const publicRest = rest === '' ? '/' : rest;
    const internal = toInternalPathname(publicRest, locale, pathnames);

    if (prefix === 'as-needed' && locale === activeDefault) {
      // Canonicalize default-locale URLs without the prefix.
      const dest = publicPathForLocale(internal, locale, pathnames);
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = dest;
      options.onLocale?.(locale, req);
      return redirectResponse(
        redirectUrl.toString(),
        308,
        cookieCfg,
        locale,
        https,
      );
    }

    options.onLocale?.(locale, req);
    if (internal !== publicRest) {
      const url = req.nextUrl.clone();
      url.pathname = joinLocalePath(locale, internal);
      return rewriteResponse(url.toString(), cookieCfg, locale, https);
    }
    return passthrough(cookieCfg, locale, https);
  }

  const resolved = options.resolveLocale
    ? await options.resolveLocale(req)
    : undefined;
  let locale =
    sanitizeLocale(resolved, activeLocales) ??
    (localeDetection
      ? detectLocale(
          req,
          activeLocales,
          activeDefault,
          cookieCfg,
          excludeDetection,
          activeMatcher,
          domain,
        )
      : activeDefault);

  locale = sanitizeLocale(locale, activeLocales) ?? activeDefault;
  options.onLocale?.(locale, req);

  const internal = toInternalPathname(pathname, locale, pathnames);
  // Prefer localized public path when the user hit the internal key.
  const publicPath = publicPathForLocale(internal, locale, pathnames);

  if (prefix === 'never') {
    const url = req.nextUrl.clone();
    url.pathname = joinLocalePath(locale, internal);
    return rewriteResponse(url.toString(), cookieCfg, locale, https);
  }

  if (prefix === 'as-needed' && locale === activeDefault) {
    // Serve default locale without prefix; rewrite to internal app path.
    if (pathname !== publicPath && pathnames) {
      // User visited internal `/about` but public is also `/about` — fine.
      // If they somehow differ for default locale, redirect to public.
      if (publicPath !== internal && pathname === internal) {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = publicPath;
        return redirectResponse(
          redirectUrl.toString(),
          308,
          cookieCfg,
          locale,
          https,
        );
      }
    }
    const url = req.nextUrl.clone();
    url.pathname = joinLocalePath(activeDefault, internal);
    return rewriteResponse(url.toString(), cookieCfg, locale, https);
  }

  // Non-default (or always): redirect to prefixed localized public URL.
  const destPublic = publicPathForLocale(internal, locale, pathnames);
  const url = req.nextUrl.clone();
  url.pathname = joinLocalePath(locale, destPublic);
  return redirectResponse(url.toString(), 307, cookieCfg, locale, https);
}

/**
 * Copy response headers from a prior `NextResponse.next()` (CSP, nonce, …)
 * onto a tongue rewrite/redirect/next response. Skips middleware control
 * headers (`x-middleware-*`, `Location` when tongue already set one).
 *
 * Use when you stamp headers on `next()` then call tongue — tongue alone
 * cannot see those headers.
 */
export function mergeProxyResponse(prior: Response, tongue: Response): Response {
  const headers = new Headers(tongue.headers);
  prior.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k.startsWith('x-middleware-')) return;
    if (k === 'location' && headers.has('location')) return;
    if (k === 'set-cookie') {
      headers.append(key, value);
      return;
    }
    if (!headers.has(key)) headers.set(key, value);
  });
  return new Response(tongue.body, {
    status: tongue.status,
    statusText: tongue.statusText,
    headers,
  });
}

/** Map internal path → localized public path for a locale. */
export function publicPathForLocale(
  internal: string,
  locale: string,
  pathnames?: Record<string, Partial<Record<string, string>>>,
): string {
  if (!pathnames) return internal;
  return pathnames[internal]?.[locale] ?? internal;
}

/** Resolve `Host` / `x-forwarded-host` against `routing.domains`. */
export function matchDomain(
  req: TongueProxyRequest,
  domains: DomainConfig[] | undefined,
): DomainConfig | undefined {
  if (!domains?.length) return undefined;
  const host = (
    req.headers.get('x-forwarded-host') ??
    req.headers.get('host') ??
    ''
  )
    .split(',')[0]
    ?.trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
  if (!host) return undefined;
  return domains.find((d) => d.domain.toLowerCase() === host);
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

/** Exported for tests — uses a fresh matcher (no shared LRU). */
export function parseAcceptLanguage(
  header: string | null,
  locales: readonly string[],
): string | undefined {
  return createLocaleMatcher(locales, { cacheSize: 1 }).match(header);
}

/**
 * Accept only an exact configured locale. Rejects path traversal, NUL, CRLF,
 * and any value that is not in the allow-list (#46).
 */
export function sanitizeLocale(
  value: string | undefined | null,
  locales: readonly string[],
): string | undefined {
  if (value == null || value === '') return undefined;
  if (/[\0\r\n\\/]/.test(value)) return undefined;
  if (value.includes('..') || value.includes('%')) return undefined;
  if (!locales.includes(value)) return undefined;
  return value;
}

function detectLocale(
  req: TongueProxyRequest,
  locales: readonly string[],
  defaultLocale: string,
  cookieCfg: LocaleCookieConfig | false,
  excludeDetection: Set<string>,
  matcher: LocaleMatcher,
  domain: DomainConfig | undefined,
): string {
  // Domain match already narrowed `locales` / `defaultLocale`.
  void domain;
  if (cookieCfg) {
    const raw = req.cookies.get(cookieCfg.name)?.value;
    const fromCookie = sanitizeLocale(raw, locales);
    if (fromCookie && !excludeDetection.has(fromCookie)) return fromCookie;
  }
  return matcher.match(req.headers.get('accept-language')) ?? defaultLocale;
}

function joinLocalePath(locale: string, pathname: string): string {
  if (pathname === '/' || pathname === '') return `/${locale}`;
  return `/${locale}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function isHttpsRequest(req: TongueProxyRequest): boolean {
  try {
    return new URL(req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

function cookieHeader(
  locale: string,
  cookieCfg: LocaleCookieConfig,
  https: boolean,
): string {
  // Locale is allow-listed; still encode and refuse CRLF in name/path.
  const name = cookieCfg.name.replace(/[\r\n;=]/g, '');
  const path = (cookieCfg.path ?? '/').replace(/[\r\n;]/g, '');
  const parts = [
    `${name}=${encodeURIComponent(locale)}`,
    `Path=${path}`,
    `Max-Age=${cookieCfg.maxAge}`,
    `SameSite=${capitalizeSameSite(cookieCfg.sameSite ?? 'lax')}`,
  ];
  // Default Secure on HTTPS; explicit `secure: false` opts out (#19).
  const useSecure = cookieCfg.secure ?? https;
  if (useSecure) parts.push('Secure');
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
  https: boolean,
): Headers {
  if (cookieCfg && locale) {
    headers.append('Set-Cookie', cookieHeader(locale, cookieCfg, https));
  }
  return headers;
}

function passthrough(
  cookieCfg: LocaleCookieConfig | false,
  locale: string | null,
  https: boolean,
): Response {
  const headers = withCookie(
    new Headers({ 'x-middleware-next': '1' }),
    cookieCfg,
    locale,
    https,
  );
  return new Response(null, { status: 200, headers });
}

function redirectResponse(
  location: string,
  status: 307 | 308,
  cookieCfg: LocaleCookieConfig | false,
  locale: string,
  https: boolean,
): Response {
  const headers = withCookie(
    new Headers({ Location: location }),
    cookieCfg,
    locale,
    https,
  );
  return new Response(null, { status, headers });
}

function rewriteResponse(
  url: string,
  cookieCfg: LocaleCookieConfig | false,
  locale: string,
  https: boolean,
): Response {
  const headers = withCookie(
    new Headers({ 'x-middleware-rewrite': url }),
    cookieCfg,
    locale,
    https,
  );
  return new Response(null, { status: 200, headers });
}
