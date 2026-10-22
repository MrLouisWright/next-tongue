# Getting started

> **Status: beta 0.9.** `tongue init` scaffolds the files below. Package: [`next-tongue` on npm](https://www.npmjs.com/package/next-tongue). See [ROADMAP](../ROADMAP.md).

**Requirements:** Next.js 16+ (App Router), React 19.2+, TypeScript 5.5+ recommended, Node 20.9+.

## 1. Install and scaffold

```bash
npm install next-tongue
npx tongue init
```

Add to `package.json` (init may already set this):

```json
{
  "scripts": { "build": "tongue build && next build" },
  "imports": { "#tongue/*": "./.tongue/*.js" }
}
```

Node resolves `#tongue/runtime` only when the mapping ends in `*.js`. TypeScript still uses `paths: { "#tongue/*": ["./.tongue/*"] }` plus `include: [".tongue/types.d.ts"]`.

`tongue init` asks for your locales and default locale, then creates/edits:

| File | What it does |
|---|---|
| `tongue.config.ts` | Single source of truth — see [Configuration](configuration.md) |
| `messages/en.json`, `messages/de.json` | Source and target messages |
| `next.config.ts` | Wrapped with `withTongue()` |
| `proxy.ts` | Locale negotiation + redirects — see [Routing & proxy](routing-and-proxy.md) |
| `app/[locale]/layout.tsx` | Root layout with `<html lang>`, `generateStaticParams`, `TongueProvider` |
| `tsconfig.json` | Adds `.tongue/types.d.ts` to `include` |
| `.gitignore` | Adds `.tongue/` (generated output) |

## 2. Configure

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
import type { NextConfig } from 'next';
import { withTongue } from 'next-tongue/next';

const nextConfig: NextConfig = { cacheComponents: true };
export default withTongue(nextConfig);
```

## 3. Add the proxy

```ts
// proxy.ts — locales/defaultLocale are required
import { createProxy } from 'next-tongue/proxy';

export const proxy = createProxy({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  prefix: 'as-needed',
});
export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] };
```

> **Matcher caveat:** `.*\\..*` skips every path containing a dot, so `/de/blog/v1.2` bypasses the proxy (no locale redirect). If you have dotted routes, exclude only real file extensions, e.g. `'/((?!api|_next|.*\\.(?:ico|png|jpg|svg|txt|xml|webmanifest)$).*)'`.

`tongue init` writes `src/proxy.ts` + `src/app/[locale]/…` when `src/` is present, skips an existing proxy by default (`--proxy merge` wires `createProxy` in place — see [Routing & proxy](routing-and-proxy.md#composing-with-your-own-proxy-logic)), and adds `tsconfig` `paths` for `#tongue/*` (tsc does not honor `package.json` `imports` alone).

**Sample `home` page:** init scaffolds `messages/*/home` (`Welcome, {name}!`) and `app/[locale]/page.tsx`. Replace or delete those keys when you wire real copy — leftover sample strings are easy to ship. Re-run with `--force` to overwrite scaffold files you still have; it will not invent a cleanup of keys you already edited. Prefer deleting unused `home.*` keys (or `tongue extract --prune` after removing the page).

## 4. Locale layout

**Greenfield** — `[locale]` is the root layout and owns `<html>`:

```tsx
// app/[locale]/layout.tsx
import { notFound } from 'next/navigation';
import { localeParams, isLocale, getDir } from 'next-tongue/server';
import { TongueProvider } from 'next-tongue/client';

export const generateStaticParams = localeParams; // [{ locale: 'en' }, { locale: 'de' }]

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} dir={getDir(locale)}>
      <body>
        <TongueProvider locale={locale}>{children}</TongueProvider>
      </body>
    </html>
  );
}
```

**Existing `app/layout.tsx`** — keep `<html>` on the root layout; `[locale]` only wraps `TongueProvider` (Next forbids nested `<html>`). Sync `lang`/`dir` with a client `HtmlLang` — `tongue check` a11y accepts that pattern (see [Routing — root-layout chrome](routing-and-proxy.md#root-layout-chrome-header--footer-outside-locale)).

`TongueProvider` passes **only the locale string** to client components. It never serialises messages — client components import compiled message modules directly (see [Architecture](architecture.md)).

## 5. Write messages and use them

ICU treats `'` as a quote. Literal apostrophes must be doubled: `Let's` → `Let''s`, `couldn't` → `couldn''t`, French `l'été` → `l''été`. An undoubled `'` before a letter can swallow `{placeholders}` so EN looks arg-free while ES mismatches. `tongue check` warns for fr/it/… always, and for English when `{…}` is present.

```json
// messages/en.json
{
  "home": {
    "title": "Welcome, {name}!",
    "inbox": "{count, plural, =0 {No messages} one {# message} other {# messages}}"
  }
}
```

```tsx
// app/[locale]/page.tsx
import { getT } from 'next-tongue/server';

export default async function Page({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  // Single namespace — or getT(locale, ['home', 'common']) → { home, common }
  const t = await getT(locale, 'home');
  return <h1>{t('title', { name: 'Ada' })}</h1>;
}
```

With `withTongue()`, importing `#tongue/runtime` (or calling `getT`) auto-runs `ensureTongue()` — no per-page boilerplate.

```tsx
'use client';
import { useT } from 'next-tongue/client';

export function InboxBadge({ count }: { count: number }) {
  const t = useT('home');
  return <span>{t('inbox', { count })}</span>;
}
```

## 6. Gate CI

```bash
npx tongue check   # fails on missing, unused or mismatched keys
```

## Next steps
- [Routing & proxy](routing-and-proxy.md) — prefix strategies, domains, detection
- [Cache Components & PPR](cache-components.md) — why locale comes from params
- [Type safety](type-safety.md) — what is checked and how

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
