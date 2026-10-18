'use client';

import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import { createFormat, type Format } from '../runtime/format.js';
import { createT, type TFunction, type MessageFn } from '../runtime/create-t.js';
import { TongueError } from '../errors.js';
import type { Namespace } from '../index.js';
import type { DevOverlayOption } from '../config/types.js';
import { DevOverlayGate } from './dev-overlay-gate.js';

export type { MessageFn };

type TongueContextValue = {
  locale: string;
  timeZone: string;
  loadNamespace?: (namespace: string) => Record<string, MessageFn>;
};

const TongueContext = createContext<TongueContextValue | null>(null);

let clientLocales: readonly string[] = [];
let clientDefaultLocale = 'en';

/** @internal */
export function __setClientRuntime(opts: {
  locales: readonly string[];
  defaultLocale: string;
}): void {
  clientLocales = opts.locales;
  clientDefaultLocale = opts.defaultLocale;
}

function resolveOverlayEnabled(devOverlay: DevOverlayOption | undefined): {
  enabled: boolean;
  editor: string;
} {
  if (devOverlay === false) return { enabled: false, editor: 'vscode' };
  if (devOverlay == null || devOverlay === true) {
    return { enabled: true, editor: 'vscode' };
  }
  return { enabled: true, editor: devOverlay.editor ?? 'vscode' };
}

/**
 * Passes **only** the locale (and optional timeZone) to the client tree.
 * Never serialises message catalogs — client `t()` uses per-key imports via
 * the call-site loader, or an explicit `loadNamespace` for tests/examples.
 *
 * In development, mounts the tongue overlay (Alt+Shift+T) unless
 * `devOverlay={false}`. Overlay code is eliminated from production builds.
 */
export function TongueProvider({
  locale,
  timeZone = 'UTC',
  loadNamespace,
  devOverlay,
  children,
}: {
  locale: string;
  timeZone?: string;
  loadNamespace?: (namespace: string) => Record<string, MessageFn>;
  /** Override config; `false` disables the panel. */
  devOverlay?: DevOverlayOption;
  children: ReactNode;
}) {
  const value: TongueContextValue = { locale, timeZone };
  if (loadNamespace) value.loadNamespace = loadNamespace;
  const overlay = resolveOverlayEnabled(devOverlay);
  return (
    <TongueContext.Provider value={value}>
      {children}
      {process.env.NODE_ENV === 'development' && overlay.enabled ? (
        <DevOverlayGate
          locale={locale}
          timeZone={timeZone}
          editor={overlay.editor}
        />
      ) : null}
    </TongueContext.Provider>
  );
}

function useTongue(): TongueContextValue {
  const ctx = useContext(TongueContext);
  if (!ctx) {
    throw new TongueError(
      'TONGUE_E_NO_PROVIDER',
      'useT/useFormat/useLocale must be used within <TongueProvider>',
    );
  }
  return ctx;
}

export function useLocale(): string {
  return useTongue().locale;
}

let warnedTimezoneMismatch = false;

export function useFormat(): Format {
  const { locale, timeZone } = useTongue();
  if (
    process.env.NODE_ENV !== 'production' &&
    typeof window !== 'undefined' &&
    !warnedTimezoneMismatch
  ) {
    try {
      const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (browserZone && browserZone !== timeZone) {
        warnedTimezoneMismatch = true;
        console.warn(
          `[next-tongue] TONGUE_W_TIMEZONE: TongueProvider timeZone="${timeZone}" differs from browser "${browserZone}". Pass an explicit timeZone to avoid hydration mismatches (ADR 0008).`,
        );
      }
    } catch {
      /* ignore */
    }
  }
  return createFormat({ locale, timeZone });
}

export function useT<N extends Namespace>(namespace?: N): TFunction<N> {
  const ns = (namespace ?? ('_root' as unknown as N)) as N;
  const { locale, loadNamespace } = useTongue();
  // Literal `t('key')` is rewritten by the call-site loader to per-key imports;
  // `useT()` itself must still be safe during SSR without loadNamespace.
  // Invoking the returned `t` without a rewrite (dynamic/escaped) throws below.
  if (!loadNamespace) {
    return createLoaderStubT(locale, String(ns)) as TFunction<N>;
  }
  const messages = loadNamespace(ns);
  return createT({
    locale,
    messages,
    loadNamespace,
  }) as TFunction<N>;
}

/**
 * Stub used when the call-site loader owns message delivery. Literal `t('key')`
 * and `t.dynamic(key, { from })` should be rewritten by the loader; if you still
 * hit this, the rewrite did not run (or a key was not in `from`).
 */
function createLoaderStubT(locale: string, ns: string): TFunction {
  const fail = (kind: string): never => {
    throw new TongueError(
      'TONGUE_E_NO_PROVIDER',
      `useT('${ns}') ${kind} was not rewritten to a per-key import. Ensure withTongue() is applied (loader on SSR + client). Prefer getT on the server for static copy; for dynamic keys use t.dynamic(key, { from: [...] }) with an inline array or a same-file const (imported from arrays are not rewritten).`,
    );
  };
  const t = Object.assign((..._args: unknown[]) => fail('t()'), {
    rich: () => fail('t.rich()'),
    has: () => false,
    dynamic: () => fail('t.dynamic()'),
    ns: () => fail('t.ns()'),
  }) as unknown as TFunction;
  void locale;
  return t;
}

export function getClientLocales(): readonly string[] {
  return clientLocales;
}

export function getClientDefaultLocale(): string {
  return clientDefaultLocale;
}

export const locales = {
  get value() {
    return clientLocales;
  },
};

export const defaultLocale = {
  get value() {
    return clientDefaultLocale;
  },
};

export type { TFunction, Format };
export type {
  SanctionedUnit,
  SimpleUnit,
  DisplayNameType,
} from '../runtime/format.js';
export { isSanctionedUnit, SIMPLE_UNITS } from '../runtime/format.js';
/** Isomorphic — safe in client HtmlLang helpers. */
export { getDir } from '../runtime/locale.js';

export {
  translateIssues,
  defaultFormatPath,
} from '../runtime/translate-issues.js';
export type {
  TranslateIssue,
  TranslateIssuesOptions,
  IssuePathSegment,
} from '../runtime/translate-issues.js';
