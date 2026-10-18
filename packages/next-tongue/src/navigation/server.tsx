/**
 * Server-safe navigation helpers. `next-tongue/navigation` is a Client Module
 * (`createNavigation` uses hooks) — importing it into a Server Component fails.
 * Use this entry for Footer / layout / not-found Link + redirect.
 *
 * Under `prefix: 'as-needed'`, plain `next/link` with unprefixed hrefs is also fine.
 */
import NextLink from 'next/link';
import {
  redirect as nextRedirect,
  permanentRedirect as nextPermanentRedirect,
} from 'next/navigation';
import type { ComponentProps, ReactNode } from 'react';
import type { Locale, Pathname } from '../index.js';
import {
  getPathname as getPathnameImpl,
  stripLocalePrefix,
  toInternalPathname,
  type PathnameInput,
} from './pathname.js';
import type { NavigationConfig } from './config.js';

export type { PathnameInput, NavigationConfig };
export {
  getPathnameImpl as getPathname,
  stripLocalePrefix,
  toInternalPathname,
};

type Href = Pathname | PathnameInput;

function bindConfig(config: NavigationConfig) {
  return {
    locales: config.locales,
    defaultLocale: config.defaultLocale,
    prefix: config.prefix ?? 'as-needed',
    pathnames: config.pathnames,
  };
}

/**
 * Server-only `createNavigation`: `Link` requires an explicit `locale` prop
 * (no `useLocale`). For client hooks use `next-tongue/navigation`.
 */
export function createNavigation(config: NavigationConfig) {
  const bound = bindConfig(config);

  function resolve(href: Href, locale: string): string {
    const args: Parameters<typeof getPathnameImpl>[0] = {
      href: href as PathnameInput,
      locale,
      locales: bound.locales,
      defaultLocale: bound.defaultLocale,
      prefix: bound.prefix,
    };
    if (bound.pathnames) args.pathnames = bound.pathnames;
    return getPathnameImpl(args);
  }

  function Link(
    props: Omit<ComponentProps<typeof NextLink>, 'href'> & {
      href: Href;
      /** Required on the server — there is no TongueProvider hook here. */
      locale: Locale;
      children?: ReactNode;
    },
  ) {
    const { href, locale, ...rest } = props;
    return <NextLink href={resolve(href, locale)} {...rest} />;
  }

  function redirect(args: { href: Href; locale: Locale }): never {
    nextRedirect(resolve(args.href, args.locale));
  }

  function permanentRedirect(args: { href: Href; locale: Locale }): never {
    nextPermanentRedirect(resolve(args.href, args.locale));
  }

  return {
    Link,
    redirect,
    permanentRedirect,
    getPathname: (args: { href: Href; locale: Locale }) =>
      resolve(args.href, args.locale),
  };
}
