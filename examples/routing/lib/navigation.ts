import { createNavigation } from 'next-tongue/navigation';

export const { Link, usePathname, getPathname } = createNavigation({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  prefix: 'always',
  pathnames: {
    '/about': { de: '/ueber-uns' },
  },
});
