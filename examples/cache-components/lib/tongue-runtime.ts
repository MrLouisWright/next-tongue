import {
  ensureTongue,
  localeParams,
  locales,
} from '#tongue/runtime.js';
import { getDir } from 'next-tongue/server';

export { ensureTongue, getDir };

export function isAppLocale(value: string): boolean {
  return (locales as readonly string[]).includes(value);
}

export function localeStaticParams() {
  return localeParams() as { locale: string }[];
}
