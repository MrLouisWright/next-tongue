export type PathnameInput =
  | string
  | {
      pathname: string;
      params?: Record<string, string | number>;
      query?: Record<string, string | number | undefined>;
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
 */
export function getPathname(args: GetPathnameArgs): string {
  const {
    href,
    locale,
    prefix = 'as-needed',
    defaultLocale = 'en',
    pathnames,
  } = args;

  let path = resolveHref(href);

  if (pathnames) {
    const localized = pathnames[path]?.[locale];
    if (localized) path = localized;
  }

  if (prefix === 'never') return path;

  if (prefix === 'as-needed' && locale === defaultLocale) {
    return path;
  }

  // always, or as-needed for non-default
  if (path === '/') return `/${locale}`;
  return `/${locale}${path.startsWith('/') ? path : `/${path}`}`;
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

function resolveHref(href: PathnameInput): string {
  if (typeof href === 'string') return href.startsWith('/') ? href : `/${href}`;
  let path = href.pathname.startsWith('/') ? href.pathname : `/${href.pathname}`;
  if (href.params) {
    for (const [key, value] of Object.entries(href.params)) {
      path = path.replace(`[${key}]`, encodeURIComponent(String(value)));
    }
  }
  if (href.query) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(href.query)) {
      if (value != null) qs.set(key, String(value));
    }
    const s = qs.toString();
    if (s) path += `?${s}`;
  }
  return path;
}
