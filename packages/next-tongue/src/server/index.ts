import { createFormat, type Format } from '../runtime/format.js';
import { createT, type MessageFn, type TFunction } from '../runtime/create-t.js';
import { getDir, getOgLocale, isLocale as isLocaleValue } from '../runtime/locale.js';
import { TongueError } from '../errors.js';
import type { Locale, Namespace } from '../index.js';

let runtimeLocales: readonly string[] = [];
let runtimeDefaultLocale = 'en';
let runtimeTimeZone = 'UTC';
let namespaceLoader:
  | ((namespace: string) => Promise<Record<string, MessageFn>>)
  | undefined;

/** @internal Used by generated `.tongue/runtime.js` / tests. */
export function __setServerRuntime(opts: {
  locales: readonly string[];
  defaultLocale: string;
  timeZone?: string;
  loadNamespace?: typeof namespaceLoader;
}): void {
  runtimeLocales = opts.locales;
  runtimeDefaultLocale = opts.defaultLocale;
  runtimeTimeZone = opts.timeZone ?? 'UTC';
  namespaceLoader = opts.loadNamespace;
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

export async function getT<N extends Namespace>(
  locale: Locale | string,
  namespace?: N,
): Promise<TFunction<N>> {
  const ns = (namespace ?? ('_root' as unknown as N)) as N;
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
  locale: string,
  options?: { timeZone?: string },
): Promise<Format> {
  assertLocale(locale);
  return createFormat({
    locale,
    timeZone: options?.timeZone ?? runtimeTimeZone,
  });
}

export function isLocale(value: unknown): value is string {
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

export type { TFunction, Format };

function assertLocale(locale: string): void {
  if (runtimeLocales.length && !runtimeLocales.includes(locale)) {
    throw new TongueError(
      'TONGUE_E_LOCALE',
      `Locale "${locale}" is not in configured locales [${runtimeLocales.join(', ')}]`,
    );
  }
}
