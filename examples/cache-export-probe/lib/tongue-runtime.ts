import { __setServerRuntime, getDir } from 'next-tongue/server';
import { messages as homeMessages } from '../.tongue/ns/home.js';

const LOCALES = ['en'] as const;

let ready = false;

export function isAppLocale(value: string): value is 'en' {
  return value === 'en';
}

export function localeStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function ensureTongueRuntime(): Promise<void> {
  if (ready) return;
  __setServerRuntime({
    locales: LOCALES,
    defaultLocale: 'en',
    loadNamespace: async (namespace) => {
      if (namespace !== 'home') throw new Error(`Unknown ns ${namespace}`);
      return homeMessages;
    },
  });
  ready = true;
}

export { getDir };
