import { createFormat, type Format } from '../runtime/format.js';
import { createT, type MessageFn, type TFunction } from '../runtime/create-t.js';
import { getDir, getOgLocale, isLocale as isLocaleValue } from '../runtime/locale.js';
import { TongueError } from '../errors.js';
import type { Locale, Namespace } from '../index.js';

let runtimeLocales: readonly string[] = [];
let runtimeDefaultLocale = 'en';
let runtimeTimeZone = 'UTC';
let runtimeRootParams = false;
let rootLocaleReader: (() => Promise<string>) | undefined;
let namespaceLoader:
  | ((namespace: string) => Promise<Record<string, MessageFn>>)
  | undefined;

/** @internal Used by generated `.tongue/runtime.js` / tests. */
export function __setServerRuntime(opts: {
  locales: readonly string[];
  defaultLocale: string;
  timeZone?: string;
  rootParams?: boolean;
  /** Injected in tests instead of `next/root-params`. */
  readRootLocale?: () => Promise<string>;
  loadNamespace?: typeof namespaceLoader;
}): void {
  runtimeLocales = opts.locales;
  runtimeDefaultLocale = opts.defaultLocale;
  runtimeTimeZone = opts.timeZone ?? 'UTC';
  runtimeRootParams = opts.rootParams === true;
  rootLocaleReader = opts.readRootLocale;
  namespaceLoader = opts.loadNamespace;
}

/** Whether `routing.rootParams` is enabled after `ensureTongue()`. */
export function isRootParamsEnabled(): boolean {
  return runtimeRootParams;
}

/** Configured locales after `ensureTongue()` / `__setServerRuntime`. */
export function getLocales(): readonly string[] {
  return runtimeLocales;
}

export function getDefaultLocale(): string {
  return runtimeDefaultLocale;
}

/** @deprecated Prefer `getLocales()`; kept for docs that reference `.value`. */
export const locales = {
  get value() {
    return runtimeLocales;
  },
};

/** @deprecated Prefer `getDefaultLocale()`. */
export const defaultLocale = {
  get value() {
    return runtimeDefaultLocale;
  },
};

export type LocaleProps = { locale: string };

/** Map of translators when loading several namespaces in one call. */
export type MultiT<Ns extends readonly Namespace[]> = {
  [K in Ns[number]]: TFunction<K>;
};

/**
 * Explicit locale (always available): `getT(locale, ns)` or `getT(locale)` for `_root`.
 * Multi-ns: `getT(locale, ['home', 'common'])` → `{ home, common }` translators.
 * With `routing.rootParams: true`, `getT(ns)` resolves locale from `next/root-params`
 * when the single argument is a configured namespace (not a locale tag).
 *
 * `withTongue()` + generated `#tongue/runtime` auto-wires messages; an explicit
 * `ensureTongue()` call is optional.
 */
export async function getT<const Ns extends readonly [Namespace, ...Namespace[]]>(
  locale: Locale | string,
  namespaces: Ns,
): Promise<MultiT<Ns>>;
export async function getT<N extends Namespace>(
  locale: Locale | string,
  namespace: N,
): Promise<TFunction<N>>;
export async function getT(
  locale: Locale | string,
): Promise<TFunction<'_root'>>;
export async function getT<N extends Namespace>(
  localeOrNs: Locale | string | N,
  namespace?: N | readonly Namespace[],
): Promise<TFunction<N> | TFunction<'_root'> | MultiT<readonly Namespace[]>> {
  if (namespace !== undefined) {
    if (Array.isArray(namespace)) {
      if (namespace.length === 0) {
        throw new TongueError(
          'TONGUE_E_CONFIG',
          'getT(locale, namespaces) requires a non-empty namespace array',
        );
      }
      const locale = String(localeOrNs);
      const out = {} as Record<string, TFunction>;
      // Load sequentially so a single ensureRuntime runs first; namespaces share locale.
      for (const ns of namespace) {
        out[ns] = await getTWithLocale(locale, ns as N);
      }
      return out as MultiT<readonly Namespace[]>;
    }
    return getTWithLocale(String(localeOrNs), namespace as N);
  }
  const single = String(localeOrNs);
  if (runtimeRootParams && runtimeLocales.length && !runtimeLocales.includes(single)) {
    // Treat as namespace when it is not a configured locale tag.
    const locale = await resolveRootLocale();
    return getTWithLocale(locale, single as N);
  }
  // Single arg is locale, `_root` namespace (canonical without rootParams).
  return getTWithLocale(single, '_root' as unknown as N);
}

async function getTWithLocale<N extends Namespace>(
  locale: string,
  ns: N,
): Promise<TFunction<N>> {
  await ensureRuntime();
  assertLocale(locale);
  if (!namespaceLoader) {
    throw new TongueError(
      'TONGUE_E_TYPES_MISSING',
      'Message modules not loaded. Wrap next.config with withTongue() and run `tongue build && next build` so `#tongue/runtime` exists. (ensureTongue() is optional — getT loads it automatically.)',
    );
  }
  const messages = await namespaceLoader(ns);
  return createT({
    locale,
    messages,
    loadNamespace: (n) => {
      throw new Error(
        `t.ns('${n}') requires sync namespace load; use getT(locale, '${n}') on the server`,
      );
    },
  }) as TFunction<N>;
}

/**
 * Load `#tongue/runtime` and call `ensureTongue()` once when the server runtime
 * is not yet wired (withTongue apps — no per-page ensureTongue boilerplate).
 */
async function ensureRuntime(): Promise<void> {
  if (namespaceLoader) return;
  try {
    const importer = new Function('s', 'return import(s)') as (
      s: string,
    ) => Promise<{ ensureTongue?: () => void }>;
    const mod = await importer('#tongue/runtime');
    mod.ensureTongue?.();
  } catch {
    /* fall through — getTWithLocale throws a clear error */
  }
}

export async function getFormat(
  locale?: string,
  options?: { timeZone?: string },
): Promise<Format> {
  await ensureRuntime();
  const resolved =
    locale ?? (runtimeRootParams ? await resolveRootLocale() : undefined);
  if (resolved == null) {
    throw new TongueError(
      'TONGUE_E_LOCALE',
      'getFormat(locale) requires a locale, or routing.rootParams: true',
    );
  }
  assertLocale(resolved);
  return createFormat({
    locale: resolved,
    timeZone: options?.timeZone ?? runtimeTimeZone,
  });
}

/**
 * Load `next/root-params` without a static specifier so Turbopack/webpack do
 * not pull it into proxy/middleware graphs when `routing.rootParams` is off.
 */
async function importRootParams(): Promise<{
  locale?: () => Promise<string | undefined>;
}> {
  const importer = new Function('s', 'return import(s)') as (
    s: string,
  ) => Promise<{ locale?: () => Promise<string | undefined> }>;
  return importer('next/root-params');
}

async function resolveRootLocale(): Promise<string> {
  if (rootLocaleReader) return rootLocaleReader();
  try {
    const mod = await importRootParams();
    if (typeof mod.locale !== 'function') {
      throw new Error('locale() missing');
    }
    const locale = await mod.locale();
    if (typeof locale !== 'string' || locale === '') {
      throw new TongueError(
        'TONGUE_E_LOCALE',
        'next/root-params locale() returned empty',
      );
    }
    assertLocale(locale);
    return locale;
  } catch (err) {
    if (err instanceof TongueError) throw err;
    throw new TongueError(
      'TONGUE_E_CONFIG',
      'routing.rootParams is enabled but next/root-params is unavailable. Enable rootParams in next.config and use a single [locale] root layout (see ADR 0007).',
    );
  }
}

export function isLocale(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false;
  // Match assertLocale: empty allow-list means runtime not wired yet.
  if (!runtimeLocales.length) {
    return !/[\0\r\n\\/]/.test(value) && !value.includes('..');
  }
  return isLocaleValue(value, runtimeLocales);
}

/** Use as `export const generateStaticParams = localeParams` on `app/[locale]/layout`. */
export function localeParams(): { locale: string }[] {
  return runtimeLocales.map((locale) => ({ locale }));
}

export function createTranslator(locale: string) {
  assertLocale(locale);
  return {
    t: <N extends Namespace>(ns: N) => getT(locale, ns),
    format: () => getFormat(locale),
  };
}

export function withLocale<R, Args extends unknown[]>(
  action: (locale: string, ...args: Args) => R,
): (locale: string, ...args: Args) => R {
  return (locale, ...args) => {
    if (!isLocale(locale)) {
      throw new TongueError(
        'TONGUE_E_LOCALE',
        `Invalid locale: ${JSON.stringify(locale)}`,
      );
    }
    return action(locale, ...args);
  };
}

export { getDir, getOgLocale };

export {
  formatMessage,
  configureFormatMessage,
} from '../runtime/format-message.js';
export type {
  FormatMessageValues,
  FormatMessageRichOptions,
  FormatMessageConfig,
} from '../runtime/format-message.js';

export {
  generateAlternates,
  createGenerateAlternates,
} from './alternates.js';
export type {
  Alternates,
  GenerateAlternatesOptions,
  CreateGenerateAlternatesConfig,
} from './alternates.js';

export {
  translateIssues,
  defaultFormatPath,
} from '../runtime/translate-issues.js';
export type {
  TranslateIssue,
  TranslateIssuesOptions,
  IssuePathSegment,
} from '../runtime/translate-issues.js';

export type { TFunction } from '../runtime/create-t.js';
export type {
  Format,
  SanctionedUnit,
  SimpleUnit,
  DisplayNameType,
} from '../runtime/format.js';
export { isSanctionedUnit, SIMPLE_UNITS } from '../runtime/format.js';

export {
  setLocalePreference,
} from './locale-preference.js';
export type {
  SetLocalePreferenceOptions,
  CookieStoreLike,
} from './locale-preference.js';

export {
  requestLocale,
  LOCALE_COOKIE_NAME,
  LOCALE_HEADER_NAME,
} from './request-locale.js';
export type {
  RequestLocaleOptions,
  RequestLocaleSource,
} from './request-locale.js';

function assertLocale(locale: string): void {
  if (runtimeLocales.length && !runtimeLocales.includes(locale)) {
    throw new TongueError(
      'TONGUE_E_LOCALE',
      `Locale "${locale}" is not in configured locales [${runtimeLocales.join(', ')}]`,
    );
  }
}
