# Getting started

> **Status: pre-release.** `tongue init` scaffolds the files below; the package is not on npm yet. See [ROADMAP](../ROADMAP.md).

**Requirements (planned):** Next.js 16+ (App Router), React 19.2+, TypeScript 5.5+ recommended, Node 20.9+.

## 1. Install and scaffold

```bash
npm install next-tongue   # not yet published
npx tongue init
```

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
// proxy.ts
import { createProxy } from 'next-tongue/proxy';

export const proxy = createProxy();
export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] };
```

> **Matcher caveat:** `.*\\..*` skips every path containing a dot, so `/de/blog/v1.2` bypasses the proxy (no locale redirect). If you have dotted routes, exclude only real file extensions, e.g. `'/((?!api|_next|.*\\.(?:ico|png|jpg|svg|txt|xml|webmanifest)$).*)'`.

## 4. Root layout

```tsx
// app/[locale]/layout.tsx
import { notFound } from 'next/navigation';
import { localeParams, isLocale } from 'next-tongue/server';
import { TongueProvider } from 'next-tongue/client';

export const generateStaticParams = localeParams; // [{ locale: 'en' }, { locale: 'de' }]

export default async function RootLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale}>
      <body>
        <TongueProvider locale={locale}>{children}</TongueProvider>
      </body>
    </html>
  );
}
```

`TongueProvider` passes **only the locale string** to client components. It never serialises messages — client components import compiled message modules directly (see [Architecture](architecture.md)).

## 5. Write messages and use them

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
  const t = await getT(locale, 'home');
  return <h1>{t('title', { name: 'Ada' })}</h1>;
}
```

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
