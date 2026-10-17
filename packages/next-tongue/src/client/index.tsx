'use client';

import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import { createFormat, type Format } from '../runtime/format.js';
import { createT, type TFunction, type MessageFn } from '../runtime/create-t.js';

type TongueContextValue = {
  locale: string;
  timeZone: string;
  loadNamespace: (namespace: string) => Record<string, MessageFn>;
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

export function TongueProvider({
  locale,
  timeZone = 'UTC',
  loadNamespace,
  children,
}: {
  locale: string;
  timeZone?: string;
  /** Injected by the call-site loader / app bootstrap. */
  loadNamespace?: (namespace: string) => Record<string, MessageFn>;
  children: ReactNode;
}) {
  const value: TongueContextValue = {
    locale,
    timeZone,
    loadNamespace:
      loadNamespace ??
      (() => {
        throw new Error(
          '[next-tongue] TongueProvider requires loadNamespace or a call-site transform',
        );
      }),
  };
  return <TongueContext.Provider value={value}>{children}</TongueContext.Provider>;
}

function useTongue(): TongueContextValue {
  const ctx = useContext(TongueContext);
  if (!ctx) {
    throw new Error('[next-tongue] useT/useFormat/useLocale must be used within TongueProvider');
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

export function useT(namespace = '_root'): TFunction {
  const { locale, loadNamespace } = useTongue();
  const messages = loadNamespace(namespace);
  return createT({
    locale,
    messages,
    loadNamespace,
  });
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
