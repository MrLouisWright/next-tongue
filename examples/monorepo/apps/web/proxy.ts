import { createProxy } from 'next-tongue/proxy';
import { defaultLocale, locales } from '#tongue/runtime.js';

export const proxy = createProxy({
  locales,
  defaultLocale,
  prefix: 'always',
});

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
