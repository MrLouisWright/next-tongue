import { getRequestConfig } from 'next-intl/server';

const locales = ['en', 'de', 'fr'] as const;

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !locales.includes(locale as (typeof locales)[number])) {
    locale = 'en';
  }

  // Best-case next-intl: provider catalog narrowed to the 2 keys this route uses
  // (manual pick — next-intl has no dedicated pick() export).
  const all = (await import(`../messages/${locale}.json`)).default as {
    bench: Record<string, string>;
  };

  return {
    locale,
    messages: {
      bench: {
        k0: all.bench.k0,
        k1: all.bench.k1,
      },
    },
  };
});
