import { isLocale as isLocaleValue } from '../runtime/locale.js';

/** Default cookie name set by `createProxy` (`SameSite=Lax`). */
export const LOCALE_COOKIE_NAME = 'TONGUE_LOCALE';

/** Common header for client → API locale (wizard / fetch). */
export const LOCALE_HEADER_NAME = 'x-locale';

export type RequestLocaleSource = {
  headers: { get: (name: string) => string | null };
  cookies?: {
    get: (name: string) => { value: string } | undefined;
  };
};

export type RequestLocaleOptions = {
  locales: readonly string[];
  defaultLocale: string;
  /** Defaults to `TONGUE_LOCALE`. */
  cookieName?: string;
  /** Defaults to `x-locale`. */
  headerName?: string;
};

/**
 * Resolve locale in Route Handlers / Server Actions (no `params.locale`).
 * Order: header → cookie → defaultLocale.
 */
export function requestLocale(
  req: RequestLocaleSource,
  opts: RequestLocaleOptions,
): string {
  const headerName = opts.headerName ?? LOCALE_HEADER_NAME;
  const cookieName = opts.cookieName ?? LOCALE_COOKIE_NAME;
  const fromHeader = req.headers.get(headerName)?.trim();
  if (fromHeader && isLocaleValue(fromHeader, opts.locales)) {
    return fromHeader;
  }
  const fromCookie = req.cookies?.get(cookieName)?.value?.trim();
  if (fromCookie && isLocaleValue(fromCookie, opts.locales)) {
    return fromCookie;
  }
  return opts.defaultLocale;
}
