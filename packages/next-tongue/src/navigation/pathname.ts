export type PathnameInput =
  | string
  | {
      pathname: string;
      params?: Record<string, string | number>;
      query?: Record<string, string | number | undefined>;
      /** Fragment without requiring `#` (e.g. `'preferences'` or `'#preferences'`). */
      hash?: string;
    };

export type GetPathnameArgs = {
  href: PathnameInput;
  locale: string;
  /** When omitted, defaults to as-needed behaviour via options.prefix. */
  prefix?: 'always' | 'as-needed' | 'never';
  defaultLocale?: string;
  /** Localized pathname map: internal path → { locale: external path } */
  pathnames?: Record<string, Partial<Record<string, string>>>;
  locales?: readonly string[];
};

/**
 * Build a localized public pathname for links, redirects, and sitemaps.
 * Query strings and hashes are preserved (stripped before pathnames/prefix,
 * reattached after). Prefer the object form for typed `pathnames` unions:
 * `{ pathname: '/dashboard', query: { demo: 1 }, hash: 'prefs' }`.
 */
export function getPathname(args: GetPathnameArgs): string {
  const {
    href,
    locale,
    prefix = 'as-needed',
    defaultLocale = 'en',
    pathnames,
  } = args;

  const { pathname: rawPath, search, hash } = resolveHref(href);
  let path = rawPath;

  if (pathnames) {
    const localized = pathnames[path]?.[locale];
    if (localized) path = localized;
  }

  if (prefix === 'never') {
    return path + search + hash;
  }

  if (prefix === 'as-needed' && locale === defaultLocale) {
    return path + search + hash;
  }

  // always, or as-needed for non-default
  if (path === '/') {
    return `/${locale}` + search + hash;
  }
  return (
    `/${locale}${path.startsWith('/') ? path : `/${path}`}` + search + hash
  );
}

/** Strip a leading locale segment from a pathname. */
export function stripLocalePrefix(
  pathname: string,
  locales: readonly string[],
): string {
  const segments = pathname.split('/');
  const maybe = segments[1];
  if (maybe && locales.includes(maybe)) {
    const rest = segments.slice(2).join('/');
    return rest ? `/${rest}` : '/';
  }
  return pathname || '/';
}

/**
 * Map a public (possibly localized) pathname back to the internal key
 * used in `routing.pathnames` (e.g. `/ueber-uns` → `/about` for `de`).
 */
export function toInternalPathname(
  pathname: string,
  locale: string,
  pathnames?: Record<string, Partial<Record<string, string>>>,
): string {
  if (!pathnames) return pathname;
  for (const [internal, map] of Object.entries(pathnames)) {
    if (map[locale] === pathname) return internal;
  }
  return pathname;
}

function resolveHref(href: PathnameInput): {
  pathname: string;
  search: string;
  hash: string;
} {
  if (typeof href === 'string') {
    return splitPathSearchHash(href.startsWith('/') ? href : `/${href}`);
  }

  let path = href.pathname.startsWith('/')
    ? href.pathname
    : `/${href.pathname}`;
  // Object pathname should be path-only; tolerate accidental ?/#.
  const split = splitPathSearchHash(path);
  path = split.pathname;

  if (href.params) {
    for (const [key, value] of Object.entries(href.params)) {
      path = path.replace(`[${key}]`, encodeURIComponent(String(value)));
    }
  }

  let search = split.search;
  if (href.query) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(href.query)) {
      if (value != null) qs.set(key, String(value));
    }
    const s = qs.toString();
    search = s ? `?${s}` : '';
  }

  let hash = split.hash;
  if (href.hash != null && href.hash !== '') {
    hash = href.hash.startsWith('#') ? href.hash : `#${href.hash}`;
  }

  return { pathname: path, search, hash };
}

/** Split `/path?q=1#hash` into parts (pathnames lookup needs the path alone). */
export function splitPathSearchHash(full: string): {
  pathname: string;
  search: string;
  hash: string;
} {
  let path = full;
  let hash = '';
  let search = '';
  const hashIdx = path.indexOf('#');
  if (hashIdx >= 0) {
    hash = path.slice(hashIdx);
    path = path.slice(0, hashIdx);
  }
  const qIdx = path.indexOf('?');
  if (qIdx >= 0) {
    search = path.slice(qIdx);
    path = path.slice(0, qIdx);
  }
  return { pathname: path || '/', search, hash };
}
