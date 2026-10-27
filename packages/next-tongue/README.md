# next-tongue

**Compiler-first, type-safe i18n for the Next.js 16 App Router.** Works with Turbopack, keeps the locale in route params, zero dependencies beyond `next` and `react`.

[![npm](https://img.shields.io/npm/v/next-tongue.svg)](https://www.npmjs.com/package/next-tongue)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

<p align="center">
  <a href="https://www.loomlocale.com/?utm_source=github&utm_medium=readme&utm_campaign=next-tongue">
    <img src="https://www.loomlocale.com/brand/powered-by-loomlocale-dark@2x.png" width="640" alt="Powered by Loomlocale: weave your app into every language. 50K free characters at loomlocale.com">
  </a>
</p>

> **Stable 1.0** — public API follows semver. See [API freeze](https://github.com/MrLouisWright/next-tongue/blob/main/docs/api-freeze.md).

## Install

```bash
npm install next-tongue
npx tongue init
```

Requires **Next.js ≥ 16** (App Router) and **React ≥ 19**.

## Quick start

```ts
// tongue.config.ts
import { defineConfig } from 'next-tongue/config';

export default defineConfig({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  messages: './messages/{locale}.json',
});
```

```ts
// next.config.ts
import { withTongue } from 'next-tongue/next';

export default withTongue({ cacheComponents: true });
```

```ts
// proxy.ts — locales + defaultLocale are required
import { createProxy } from 'next-tongue/proxy';

export const proxy = createProxy({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  prefix: 'as-needed',
});
export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] };
```

```tsx
// app/[locale]/page.tsx
import { getT } from 'next-tongue/server';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getT(locale, 'home');
  return <h1>{t('title')}</h1>;
}
```

## Package exports

| Import | Use |
|---|---|
| `next-tongue/config` | `defineConfig` |
| `next-tongue/next` | `withTongue` |
| `next-tongue/server` | `getT`, `getFormat`, `localeParams`, … |
| `next-tongue/client` | `TongueProvider`, `useT`, … |
| `next-tongue/proxy` | `createProxy` |
| `next-tongue/navigation` | `createNavigation` |
| `next-tongue/testing` | test helpers |

CLI: `tongue build | check | extract | init | export | import | report | translate | migrate`

## Docs

- [Getting started](https://github.com/MrLouisWright/next-tongue/blob/main/docs/getting-started.md)
- [Configuration](https://github.com/MrLouisWright/next-tongue/blob/main/docs/configuration.md)
- [CLI](https://github.com/MrLouisWright/next-tongue/blob/main/docs/cli.md)
- [Migration from next-intl](https://github.com/MrLouisWright/next-tongue/blob/main/docs/migration/next-intl.md)
- [Roadmap](https://github.com/MrLouisWright/next-tongue/blob/main/ROADMAP.md)

## License

MIT © Louis Wright
