import { createFormat, type Format } from '../runtime/format.js';
import { createT, type TFunction } from '../runtime/create-t.js';
import { getDir, getOgLocale, isLocale as isLocaleValue } from '../runtime/locale.js';
import { TongueError } from '../errors.js';

// These are filled by codegen / withTongue via a generated runtime config module.
// Until an app runs tongue build, they fall back to empty placeholders.
let runtimeLocales: readonly string[] = [];
let runtimeDefaultLocale = 'en';
let runtimeTimeZone = 'UTC';
let namespaceLoader:
  | ((namespace: string) => Promise<Record<string, (locale: string, values?: Record<string, unknown>) => string>>)
  | undefined;

/** @internal Used by withTongue / tests to inject generated config. */
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

export const locales = {
  get value() {
    return runtimeLocales;
  },
};

export const defaultLocale = {
  get value() {
    return runtimeDefaultLocale;
  },
};

export async function getT(locale: string, namespace = '_root'): Promise<TFunction> {
  assertLocale(locale);
  if (!namespaceLoader) {
    throw new TongueError(
      'TONGUE_E_TYPES_MISSING',
      'Message modules not loaded. Run `tongue build` or wrap next.config with withTongue().',
    );
  }
  const messages = await namespaceLoader(namespace);
  return createT({
    locale,
    messages,
    loadNamespace: (ns) => {
      throw new Error(
        `t.ns('${ns}') requires sync namespace load; use getT(locale, '${ns}') on the server`,
      );
    },
  });
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

export function localeParams(): { locale: string }[] {
  return runtimeLocales.map((locale) => ({ locale }));
}

export function createTranslator(locale: string) {
  assertLocale(locale);
  return {
    t: (ns: string) => getT(locale, ns),
    format: () => getFormat(locale),
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
