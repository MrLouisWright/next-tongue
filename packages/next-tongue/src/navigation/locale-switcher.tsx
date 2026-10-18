'use client';

import { usePathname as useNextPathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useLocale } from '../client/index.js';
import {
  getPathname,
  stripLocalePrefix,
  toInternalPathname,
  type PathnameInput,
} from './pathname.js';
import type { NavigationConfig } from './config.js';

export type LocaleSwitcherOption = {
  locale: string;
  /** Locale name in that locale (`Intl.DisplayNames`). */
  label: string;
  href: string;
  current: boolean;
  hreflang: string;
};

export type UseLocaleSwitcherResult = LocaleSwitcherOption[];

function labelFor(locale: string): string {
  try {
    return (
      new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale
    );
  } catch {
    return locale;
  }
}

/** Pure builder — used by the hook and by tests. */
export function buildLocaleSwitcherOptions(
  config: NavigationConfig,
  state: { locale: string; pathname: string },
): UseLocaleSwitcherResult {
  const prefix = config.prefix ?? 'as-needed';
  const stripped = stripLocalePrefix(state.pathname, config.locales);
  const internal = toInternalPathname(
    stripped,
    state.locale,
    config.pathnames,
  );

  return config.locales.map((loc) => {
    // Prefer a prefixed URL for the default locale under as-needed so the
    // proxy can refresh the locale cookie before the 308 to the bare path.
    const linkPrefix =
      prefix === 'as-needed' && loc === config.defaultLocale ? 'always' : prefix;
    const args: Parameters<typeof getPathname>[0] = {
      href: internal as PathnameInput,
      locale: loc,
      defaultLocale: config.defaultLocale,
      prefix: linkPrefix,
      locales: config.locales,
    };
    if (config.pathnames) args.pathnames = config.pathnames;
    const href = getPathname(args);
    return {
      locale: loc,
      label: labelFor(loc),
      href,
      current: loc === state.locale,
      hreflang: loc,
    };
  });
}

export function createLocaleSwitcher(config: NavigationConfig) {
  function useLocaleSwitcher(): UseLocaleSwitcherResult {
    const locale = useLocale();
    const rawPath = useNextPathname();
    return buildLocaleSwitcherOptions(config, {
      locale,
      pathname: rawPath,
    });
  }

  function LocaleSwitcher({
    children,
  }: {
    children: (options: UseLocaleSwitcherResult) => ReactNode;
  }) {
    const options = useLocaleSwitcher();
    return <>{children(options)}</>;
  }

  return { useLocaleSwitcher, LocaleSwitcher };
}
