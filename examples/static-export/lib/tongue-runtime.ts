import { __setServerRuntime, getDir } from 'next-tongue/server';
import { messages as homeMessages } from '../.tongue/ns/home.js';

const LOCALES = ['en', 'de'] as const;
export type AppLocale = (typeof LOCALES)[number];

const NAMESPACES = { home: homeMessages } as const;

let ready = false;

export function isAppLocale(value: string): value is AppLocale {
  return (LOCALES as readonly string[]).includes(value);
}

export function localeStaticParams(): { locale: AppLocale }[] {
  return LOCALES.map((locale) => ({ locale }));
}

export async function ensureTongueRuntime(): Promise<void> {
  if (ready) return;
  __setServerRuntime({
    locales: LOCALES,
    defaultLocale: 'en',
    timeZone: 'UTC',
    loadNamespace: async (namespace) => {
      const messages = NAMESPACES[namespace as keyof typeof NAMESPACES];
      if (!messages) throw new Error(`Unknown namespace: ${namespace}`);
      return messages as Record<
        string,
        (locale: string, values?: Record<string, unknown>) => string
      >;
    },
  });
  ready = true;
}

export { getDir };
