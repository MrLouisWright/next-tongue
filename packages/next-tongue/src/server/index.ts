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

/**
 * Explicit locale (always available).
 * With `routing.rootParams: true`, also `getT(ns)` — locale from `next/root-params`.
 */
export async function getT<N extends Namespace>(
  locale: Locale | string,
  namespace: N,
): Promise<TFunction<N>>;
export async function getT<N extends Namespace>(
  namespace: N,
): Promise<TFunction<N>>;
export async function getT(
  locale: string,
): Promise<TFunction<'_root' & Namespace>>;
export async function getT<N extends Namespace>(
  localeOrNs: Locale | string | N,
  namespace?: N,
): Promise<TFunction<N>> {
  if (namespace !== undefined) {
    return getTWithLocale(String(localeOrNs), namespace);
  }
  if (runtimeRootParams) {
    const locale = await resolveRootLocale();
    return getTWithLocale(locale, localeOrNs as N);
  }
  // Legacy: single arg is locale, `_root` namespace.
  return getTWithLocale(String(localeOrNs), '_root' as unknown as N);
}

async function getTWithLocale<N extends Namespace>(
  locale: string,
  ns: N,
): Promise<TFunction<N>> {
  assertLocale(locale);
  if (!namespaceLoader) {
    throw new TongueError(
      'TONGUE_E_TYPES_MISSING',
      'Message modules not loaded. Call ensureTongue() from `#tongue/runtime` (or wrap next.config with withTongue()).',
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

export async function getFormat(
  locale?: string,
  options?: { timeZone?: string },
): Promise<Format> {
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

async function resolveRootLocale(): Promise<string> {
  if (rootLocaleReader) return rootLocaleReader();
  try {
    const mod = (await import('next/root-params')) as {
      locale?: () => Promise<string | undefined>;
    };
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

function assertLocale(locale: string): void {
  if (runtimeLocales.length && !runtimeLocales.includes(locale)) {
    throw new TongueError(
      'TONGUE_E_LOCALE',
      `Locale "${locale}" is not in configured locales [${runtimeLocales.join(', ')}]`,
    );
  }
}
