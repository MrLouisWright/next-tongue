# Cache Components & PPR

> **Status: beta 0.9 (API freeze).** Install `next-tongue` from npm. See [ROADMAP](../ROADMAP.md) and [API freeze](api-freeze.md).

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

## Why not `next/root-params`?

Next.js 16.3 added `next/root-params`, which can read `[locale]` without passing it down. The explicit `getT(locale, ns)` API stays canonical. Opt in with `routing.rootParams: true` to use `getT(ns)` / `getFormat()` (requires Next ≥ 16.3.8 for correct `"use cache"` locale switches). Two sibling root layouts (marketing `/` + `[locale]`) still lack generated types ([vercel/next.js#96756](https://github.com/vercel/next.js/issues/96756)) — keep the explicit locale there. See [ADR 0007](adr/0007-root-params-not-default.md).

## Dates and time zones

Formatting uses `timeZone` from `tongue.config.ts` (default `'UTC'`), never the server's default zone. The static shell and the browser therefore produce the same string, so there is no hydration mismatch. To show a user's own zone, scope it to a dynamic part of the tree:

```tsx
// Inside a <Suspense> boundary: reads the zone from a cookie set by your app
const tz = (await cookies()).get('tz')?.value ?? 'UTC';
const f = await getFormat(locale, { timeZone: tz });
```

On the client, wrap the subtree in `<TongueProvider locale={locale} timeZone={tz}>`. See [ADR 0008](adr/0008-explicit-time-zone.md).

## Things to avoid

| Don't | Do |
|---|---|
| Read `Accept-Language` in a page | Let `proxy.ts` redirect/rewrite |
| `new Date()` in a message arg in the shell | Pass a stable value, or render relative time inside a dynamic/Suspense boundary |
| `t.ns(ns)` or undeclared dynamic keys in hot client paths | Declare keys with `t.dynamic(key, { from })`, or translate on the server and pass strings |
| Forget `generateStaticParams` in the root `[locale]` layout | `export const generateStaticParams = localeParams` (params are runtime data otherwise) |

## Verification

The v0.1 milestone includes `examples/cache-components`, an e2e fixture app built with `cacheComponents: true` asserting (a) `next build` reports localized routes as prerendered (static or partial prerender), and (b) no `headers()`/`cookies()` call originates from next-tongue code. See [ROADMAP](../ROADMAP.md).

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
