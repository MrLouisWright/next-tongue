'use client';

import NextLink from 'next/link';
import {
  usePathname as useNextPathname,
  useRouter as useNextRouter,
  redirect as nextRedirect,
  permanentRedirect as nextPermanentRedirect,
} from 'next/navigation';
import type { ComponentProps, ReactNode } from 'react';
import { useLocale } from '../client/index.js';
import type { Locale, Pathname } from '../index.js';
import {
  getPathname as getPathnameImpl,
  stripLocalePrefix,
  type PathnameInput,
} from './pathname.js';

export type { PathnameInput };
export { getPathnameImpl as getPathname, stripLocalePrefix };

export type NavigationConfig = {
  locales: readonly string[];
  defaultLocale: string;
  prefix?: 'always' | 'as-needed' | 'never';
  pathnames?: Record<string, Partial<Record<string, string>>>;
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
 * Create locale-aware navigation helpers bound to routing config.
 * Prefer this over the unbound exports when pathnames/prefix are set.
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
      locale?: Locale;
      children?: ReactNode;
    },
  ) {
    const current = useLocale();
    const { href, locale, ...rest } = props;
    const path = resolve(href, locale ?? current);
    return <NextLink href={path} {...rest} />;
  }

  function redirect(args: { href: Href; locale: Locale }): never {
    nextRedirect(resolve(args.href, args.locale));
  }

  function permanentRedirect(args: { href: Href; locale: Locale }): never {
    nextPermanentRedirect(resolve(args.href, args.locale));
  }

  function useRouter() {
    const router = useNextRouter();
    const current = useLocale();
    return {
      push(href: Href, opts?: { locale?: Locale; scroll?: boolean }) {
        const path = resolve(href, opts?.locale ?? current);
        if (opts?.scroll !== undefined) router.push(path, { scroll: opts.scroll });
        else router.push(path);
      },
      replace(href: Href, opts?: { locale?: Locale; scroll?: boolean }) {
        const path = resolve(href, opts?.locale ?? current);
        if (opts?.scroll !== undefined) router.replace(path, { scroll: opts.scroll });
        else router.replace(path);
      },
      prefetch(href: Href, opts?: { locale?: Locale }) {
        router.prefetch(resolve(href, opts?.locale ?? current));
      },
      back: () => router.back(),
      forward: () => router.forward(),
      refresh: () => router.refresh(),
    };
  }

  function usePathname(): string {
    const raw = useNextPathname();
    return stripLocalePrefix(raw, bound.locales);
  }

  return {
    Link,
    redirect,
    permanentRedirect,
    useRouter,
    usePathname,
    getPathname: (args: { href: Href; locale: Locale }) =>
      resolve(args.href, args.locale),
  };
}
