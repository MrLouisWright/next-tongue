'use client';

import { createNavigation } from 'next-tongue/navigation';

/** Mirrors tongue.config — keep in sync (client-safe; no `#tongue/runtime`). */
export const { Link, LocaleSwitcher, useLocaleSwitcher, usePathname, useRouter } =
  createNavigation({
    locales: ['en', 'de'],
    defaultLocale: 'en',
    prefix: 'as-needed',
  });
