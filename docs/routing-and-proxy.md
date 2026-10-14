# Routing & proxy

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

Next.js 16 renamed `middleware.ts` to `proxy.ts` (exported function `proxy`, Node.js runtime). next-tongue does **all** request-dependent locale work there, so pages and layouts can stay static and cacheable. See [ADR 0002](adr/0002-locale-from-params-only.md).

## Setup

```ts
// proxy.ts
import { createProxy } from 'next-tongue/proxy';

export const proxy = createProxy();
export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] };
```

All pages live under `app/[locale]/`. The proxy guarantees that by the time a request reaches the app, the `[locale]` segment is a valid locale.

## What the proxy does

1. If the pathname starts with a known locale prefix → pass through (and refresh the locale cookie if enabled).
2. Otherwise, determine the locale: domain match → cookie → `Accept-Language` → `defaultLocale`.
3. `prefix: 'always'` → **redirect** to `/{locale}/...`.
   `prefix: 'as-needed'` → for the default locale, **rewrite** internally to `/{defaultLocale}/...`; otherwise redirect.
   `prefix: 'never'` → always **rewrite**.
4. Localized `pathnames` are mapped in both directions (`/de/ueber-uns` ↔ `/de/about`).

## Prefix strategies

| `prefix` | URL for `en` (default) | URL for `de` | Static-export friendly |
|---|---|---|---|
| `'always'` | `/en/about` | `/de/about` | ✅ |
| `'as-needed'` | `/about` | `/de/about` | ⚠️ needs a host rewrite for `/` (see [Static export](static-export.md)) |
| `'never'` | `/about` | `/about` (cookie/domain) | ❌ |

## Composing with your own proxy logic

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createProxy } from 'next-tongue/proxy';

const tongue = createProxy();

export async function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/admin') && !req.cookies.get('session')) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return tongue(req);
}
```

`createProxy(options?)` accepts overrides: `{ localeDetection?, onLocale?(locale, req) }`.

## Locale-aware navigation

```tsx
import { Link, redirect, useRouter, usePathname, getPathname } from 'next-tongue/navigation';

<Link href="/about">About</Link>               // → /de/ueber-uns when locale is de
<Link href="/about" locale="en">English</Link>  // locale switcher

redirect({ href: '/login', locale });          // server: explicit locale, no headers read
const router = useRouter(); router.push('/about');    // client: uses TongueProvider locale
const path = usePathname();                     // '/about' (locale prefix stripped)
getPathname({ href: '/about', locale: 'de' });  // '/de/ueber-uns' — for sitemaps, emails
```

Server-side `redirect` requires an explicit `locale` because reading it implicitly would need request headers — see [Cache Components](cache-components.md).

## Not found

Add `app/[locale]/not-found.tsx` for localized 404s. Unknown locales should call `notFound()` in the root layout (`isLocale` helper). A global `app/not-found.tsx` handles requests the proxy did not match.

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
