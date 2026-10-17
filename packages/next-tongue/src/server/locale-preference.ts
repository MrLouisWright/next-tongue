import { TongueError } from '../errors.js';
import { isLocale as isLocaleValue } from '../runtime/locale.js';
import {
  DEFAULT_PREF_COOKIE,
  signLocalePreference,
} from '../runtime/locale-preference.js';
import { getLocales } from './index.js';

export type CookieStoreLike = {
  set: (
    name: string,
    value: string,
    options: {
      httpOnly?: boolean;
      sameSite?: 'lax' | 'strict' | 'none';
      secure?: boolean;
      path?: string;
      maxAge?: number;
    },
  ) => void;
};

export type SetLocalePreferenceOptions = {
  /** HMAC secret (e.g. `process.env.TONGUE_PREF_SECRET`). */
  secret: string;
  /** Persist to your DB after validation. */
  save?: (locale: string) => void | Promise<void>;
  cookieName?: string;
  /** Cookie / signature lifetime in seconds (default 1 year). */
  maxAge?: number;
  /** `Secure` flag (default `true`). Pass `false` for local HTTP e2e. */
  secure?: boolean;
  /**
   * Injected cookie jar for tests. Defaults to `next/headers` `cookies()`.
   * This is the only next-tongue server path allowed to touch cookies (ADR 0002).
   */
  cookieStore?: CookieStoreLike;
};

/**
 * Validate `locale`, optionally save it, and set an HMAC-signed preference cookie.
 * Call from a Server Action only — never from a cached Server Component.
 */
export async function setLocalePreference(
  locale: unknown,
  opts: SetLocalePreferenceOptions,
): Promise<string> {
  const locales = getLocales();
  const ok =
    typeof locale === 'string' &&
    locale !== '' &&
    (locales.length
      ? isLocaleValue(locale, locales)
      : !/[\0\r\n\\/]/.test(locale) && !locale.includes('..'));
  if (!ok) {
    throw new TongueError(
      'TONGUE_E_LOCALE',
      `Invalid locale preference: ${JSON.stringify(locale)}`,
    );
  }
  const validLocale = locale as string;
  if (!opts.secret) {
    throw new TongueError(
      'TONGUE_E_CONFIG',
      'setLocalePreference requires a non-empty secret',
    );
  }

  await opts.save?.(validLocale);

  const maxAge = opts.maxAge ?? 60 * 60 * 24 * 365;
  const value = await signLocalePreference(validLocale, opts.secret, { maxAge });
  const name = opts.cookieName ?? DEFAULT_PREF_COOKIE;

  const jar: CookieStoreLike =
    opts.cookieStore ?? (await (await import('next/headers')).cookies());

  jar.set(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: opts.secure !== false,
    path: '/',
    maxAge,
  });

  return validLocale;
}
