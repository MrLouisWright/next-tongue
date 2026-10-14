# Cache Components & PPR

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

With `cacheComponents: true` (Next.js 16), anything that reads request data — `headers()`, `cookies()`, `searchParams` — makes that part of the tree dynamic, and it cannot be used inside `'use cache'`. An i18n library that reads the locale from a header or cookie at render time therefore pushes every translated component out of the static shell. That is the root of the issues discussed in [amannn/next-intl#1493](https://github.com/amannn/next-intl/issues/1493) and [#2412](https://github.com/amannn/next-intl/issues/2412).

## next-tongue's rule

> The locale is a **route param**. Only `proxy.ts` reads headers and cookies.

Consequences:
- `getT(locale)` takes the locale explicitly and reads nothing from the request → safe in the static shell and inside `'use cache'`.
- The locale is part of the cache key automatically, because it is a function argument.
- Client components read the locale from `TongueProvider`, which got it from `params`.

## Examples

```tsx
// app/[locale]/page.tsx — fully static shell, prerendered per locale
import { Suspense } from 'react';
import { getT, localeParams } from 'next-tongue/server';

export const generateStaticParams = localeParams;

export default async function Page({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  const t = await getT(locale, 'home');
  return (
    <>
      <h1>{t('title', { name: 'friend' })}</h1>
      <Suspense fallback={<p>{t('loading')}</p>}>
        <Cart locale={locale} />   {/* dynamic hole: reads cookies() itself */}
      </Suspense>
    </>
  );
}
```

```tsx
// Cached data component
import { cacheLife } from 'next/cache';
import type { Locale } from 'next-tongue';

async function Products({ locale }: { locale: Locale }) {
  'use cache';
  cacheLife('hours');
  const t = await getT(locale, 'shop');
  const products = await db.products(locale);
  return <ul>{products.map((p) => <li key={p.id}>{t('price', { amount: p.price })}</li>)}</ul>;
}
```

## Things to avoid

| Don't | Do |
|---|---|
| Read `Accept-Language` in a page | Let `proxy.ts` redirect/rewrite |
| `new Date()` in a message arg in the shell | Pass a stable value, or render relative time inside a dynamic/Suspense boundary |
| `t.dynamic(someString)` in hot client paths | Use typed keys so only used messages ship |

## Verification

The v0.2 milestone includes an e2e fixture app built with `cacheComponents: true` asserting (a) `next build` reports localized routes as prerendered (static or partial prerender), and (b) no `headers()`/`cookies()` call originates from next-tongue code. See [ROADMAP](../ROADMAP.md).

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
