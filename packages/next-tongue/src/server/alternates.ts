import type { DomainConfig } from '../config/types.js';
import {
  getPathname,
  type PathnameInput,
} from '../navigation/pathname.js';

export type GenerateAlternatesOptions = {
  href: PathnameInput;
  locale: string;
  locales: readonly string[];
  defaultLocale: string;
  prefix?: 'always' | 'as-needed' | 'never';
  pathnames?: Record<string, Partial<Record<string, string>>>;
  domains?: readonly DomainConfig[];
  /** Locale used for `x-default` (defaults to `defaultLocale`). */
  xDefaultLocale?: string;
  /** Force absolute URLs with this origin when domains are not used. */
  origin?: string;
};

export type Alternates = {
  canonical: string;
  languages: Record<string, string>;
};

/**
 * Build Next.js `metadata.alternates` with reciprocal hreflang + x-default (#13).
 */
export function generateAlternates(opts: GenerateAlternatesOptions): Alternates {
  const {
    href,
    locale,
    locales,
    defaultLocale,
    prefix = 'as-needed',
    pathnames,
    domains,
    xDefaultLocale = defaultLocale,
    origin,
  } = opts;

  if (!locales.includes(locale)) {
    throw new Error(
      `[next-tongue] generateAlternates: locale "${locale}" is not in locales`,
    );
  }
  if (!locales.includes(xDefaultLocale)) {
    throw new Error(
      `[next-tongue] generateAlternates: xDefaultLocale "${xDefaultLocale}" is not in locales`,
    );
  }

  const pathFor = (loc: string) => {
    const domain = domainForLocale(loc, domains);
    // Single-locale domains omit the locale prefix (host already selects locale).
    const effectivePrefix =
      domain && domain.locales.length === 1 ? 'never' : prefix;
    const effectiveDefault =
      domain && domain.locales.length > 1 ? domain.defaultLocale : defaultLocale;
    return getPathname({
      href,
      locale: loc,
      prefix: effectivePrefix,
      defaultLocale: effectiveDefault,
      ...(pathnames ? { pathnames } : {}),
      locales,
    });
  };

  const urlFor = (loc: string): string => {
    const path = pathFor(loc);
    const domain = domainForLocale(loc, domains);
    if (domain) {
      return `https://${domain.domain}${path === '/' ? '' : path}`;
    }
    if (origin) {
      const base = origin.replace(/\/$/, '');
      return `${base}${path}`;
    }
    return path;
  };

  const languages: Record<string, string> = {};
  for (const loc of locales) {
    languages[loc] = urlFor(loc);
  }
  languages['x-default'] = urlFor(xDefaultLocale);

  return {
    canonical: urlFor(locale),
    languages,
  };
}

function domainForLocale(
  locale: string,
  domains: readonly DomainConfig[] | undefined,
): DomainConfig | undefined {
  if (!domains?.length) return undefined;
  return (
    domains.find((d) => d.locales.includes(locale)) ??
    domains.find((d) => d.defaultLocale === locale)
  );
}

export type CreateGenerateAlternatesConfig = {
  locales: readonly string[];
  defaultLocale: string;
  prefix?: 'always' | 'as-needed' | 'never';
  pathnames?: Record<string, Partial<Record<string, string>>>;
  domains?: readonly DomainConfig[];
  xDefaultLocale?: string;
  origin?: string;
};

/** Bind routing config once (typical next to `createNavigation`). */
export function createGenerateAlternates(config: CreateGenerateAlternatesConfig) {
  return function boundGenerateAlternates(args: {
    href: PathnameInput;
    locale: string;
  }): Alternates {
    return generateAlternates({
      ...config,
      href: args.href,
      locale: args.locale,
    });
  };
}
