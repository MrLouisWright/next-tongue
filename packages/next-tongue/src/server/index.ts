import { createFormat, type Format } from '../runtime/format.js';
import { createT, type MessageFn, type TFunction } from '../runtime/create-t.js';
import { getDir, getOgLocale, isLocale as isLocaleValue } from '../runtime/locale.js';
import { TongueError } from '../errors.js';
import type { Locale, Namespace } from '../index.js';

/**
 * Shared across duplicated `next-tongue/server` module instances (Turbopack/webpack
 * can load the package once via the app graph and again via `#tongue/runtime`'s
 * dynamic import). Module-local `let` would leave getT seeing an unwired copy.
 */
type ServerRuntimeState = {
  locales: readonly string[];
  defaultLocale: string;
  timeZone: string;
  rootParams: boolean;
  rootLocaleReader: (() => Promise<string>) | undefined;
  namespaceLoader:
    | ((namespace: string) => Promise<Record<string, MessageFn>>)
    | undefined;
};

const SERVER_STATE_KEY = '__nextTongueServerRuntime';

function serverState(): ServerRuntimeState {
  const g = globalThis as unknown as Record<string, ServerRuntimeState | undefined>;
  let s = g[SERVER_STATE_KEY];
  if (!s) {
    s = {
      locales: [],
      defaultLocale: 'en',
      timeZone: 'UTC',
      rootParams: false,
      rootLocaleReader: undefined,
      namespaceLoader: undefined,
    };
    g[SERVER_STATE_KEY] = s;
  }
  return s;
}

/** @internal Used by generated `.tongue/runtime.js` / tests. */
export function __setServerRuntime(opts: {
  locales: readonly string[];
  defaultLocale: string;
  timeZone?: string;
  rootParams?: boolean;
  /** Injected in tests instead of `next/root-params`. */
  readRootLocale?: () => Promise<string>;
  loadNamespace?: ServerRuntimeState['namespaceLoader'];
}): void {
  const s = serverState();
  s.locales = opts.locales;
  s.defaultLocale = opts.defaultLocale;
  s.timeZone = opts.timeZone ?? 'UTC';
  s.rootParams = opts.rootParams === true;
  s.rootLocaleReader = opts.readRootLocale;
  s.namespaceLoader = opts.loadNamespace;
}

/** Whether `routing.rootParams` is enabled after `ensureTongue()`. */
export function isRootParamsEnabled(): boolean {
  return serverState().rootParams;
}

/** Configured locales after `ensureTongue()` / `__setServerRuntime`. */
export function getLocales(): readonly string[] {
  return serverState().locales;
}

export function getDefaultLocale(): string {
  return serverState().defaultLocale;
}

/** @deprecated Prefer `getLocales()`; kept for docs that reference `.value`. */
export const locales = {
  get value() {
    return serverState().locales;
  },
};

/** @deprecated Prefer `getDefaultLocale()`. */
export const defaultLocale = {
  get value() {
    return serverState().defaultLocale;
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
 * Prefer a static `import { localeParams } from '#tongue/runtime'` in the
 * `[locale]` layout so codegen and getT share one module graph. Lazy load via
 * getT still works (runtime state lives on `globalThis`).
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
  const s = serverState();
  if (s.rootParams && s.locales.length && !s.locales.includes(single)) {
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
  const loader = serverState().namespaceLoader;
  if (!loader) {
    throw new TongueError(
      'TONGUE_E_TYPES_MISSING',
      'Message modules not loaded. Wrap next.config with withTongue(), run `tongue build && next build`, and statically import `#tongue/runtime` in app/[locale]/layout (e.g. `import { localeParams } from \'#tongue/runtime\'`). package.json must map `"#tongue/*": "./.tongue/*.js"`.',
    );
  }
  const messages = await loader(ns);
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
 * is not yet wired. Prefer a static import in the [locale] layout; this lazy
 * path uses globalThis so it shares state with that import.
 */
async function ensureRuntime(): Promise<void> {
  if (serverState().namespaceLoader) return;
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
  const s = serverState();
  const resolved =
    locale ?? (s.rootParams ? await resolveRootLocale() : undefined);
  if (resolved == null) {
    throw new TongueError(
      'TONGUE_E_LOCALE',
      'getFormat(locale) requires a locale, or routing.rootParams: true',
    );
  }
  assertLocale(resolved);
  return createFormat({
    locale: resolved,
    timeZone: options?.timeZone ?? s.timeZone,
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
  const reader = serverState().rootLocaleReader;
  if (reader) return reader();
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
  const configured = serverState().locales;
  // Match assertLocale: empty allow-list means runtime not wired yet.
  if (!configured.length) {
    return !/[\0\r\n\\/]/.test(value) && !value.includes('..');
  }
  return isLocaleValue(value, configured);
}

/** Use as `export const generateStaticParams = localeParams` on `app/[locale]/layout`. */
export function localeParams(): { locale: string }[] {
  return serverState().locales.map((locale) => ({ locale }));
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
  const configured = serverState().locales;
  if (configured.length && !configured.includes(locale)) {
    throw new TongueError(
      'TONGUE_E_LOCALE',
      `Locale "${locale}" is not in configured locales [${configured.join(', ')}]`,
    );
  }
}
