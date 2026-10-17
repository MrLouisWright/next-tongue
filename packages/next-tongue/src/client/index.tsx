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

/**
 * Passes **only** the locale (and optional timeZone) to the client tree.
 * Never serialises message catalogs — client `t()` uses per-key imports via
 * the call-site loader, or an explicit `loadNamespace` for tests/examples.
 */
export function TongueProvider({
  locale,
  timeZone = 'UTC',
  loadNamespace,
  children,
}: {
  locale: string;
  timeZone?: string;
  loadNamespace?: (namespace: string) => Record<string, MessageFn>;
  children: ReactNode;
}) {
  const value: TongueContextValue = { locale, timeZone };
  if (loadNamespace) value.loadNamespace = loadNamespace;
  return (
    <TongueContext.Provider value={value}>{children}</TongueContext.Provider>
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

export function useFormat(): Format {
  const { locale, timeZone } = useTongue();
  return createFormat({ locale, timeZone });
}

export function useT<N extends Namespace = '_root'>(namespace?: N): TFunction<N> {
  const ns = (namespace ?? '_root') as N;
  const { locale, loadNamespace } = useTongue();
  if (!loadNamespace) {
    throw new TongueError(
      'TONGUE_E_NO_PROVIDER',
      `useT('${String(ns)}') needs the call-site loader (or pass loadNamespace to TongueProvider). Prefer translating on the server with getT and passing strings.`,
    );
  }
  const messages = loadNamespace(ns);
  return createT({
    locale,
    messages,
    loadNamespace,
  }) as TFunction<N>;
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
