import { redirect as nextRedirect } from 'next/navigation';

export const locales = ['en', 'de'] as const;
const defaultLocale = 'en';

/** Locale-aware redirect for Server Actions (createNavigation is client-only). */
export function redirect(args: {
  href: string;
  locale: (typeof locales)[number];
}): never {
  const { href, locale } = args;
  const path =
    locale === defaultLocale
      ? href
      : href === '/'
        ? `/${locale}`
        : `/${locale}${href.startsWith('/') ? href : `/${href}`}`;
  nextRedirect(path);
}
