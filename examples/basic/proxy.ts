import { createProxy, verifyLocalePreference } from 'next-tongue/proxy';
import { defaultLocale, locales } from '#tongue/runtime.js';

const prefSecret =
  process.env.TONGUE_PREF_SECRET ?? 'basic-example-pref-secret';

export const proxy = createProxy({
  locales,
  defaultLocale,
  prefix: 'as-needed',
  resolveLocale: async (req) =>
    verifyLocalePreference(req.cookies.get('TONGUE_PREF')?.value, prefSecret, {
      locales,
    }),
});

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
