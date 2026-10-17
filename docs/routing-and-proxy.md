# Routing & proxy

> **Status: pre-release.** Prefix strategies, pathnames and domains ship in v0.4. See [ROADMAP](../ROADMAP.md).

Next.js 16 renamed `middleware.ts` to `proxy.ts` (exported function `proxy`, Node.js runtime). next-tongue does **all** request-dependent locale work there, so pages and layouts can stay static and cacheable. See [ADR 0002](adr/0002-locale-from-params-only.md).

## Setup

```ts
// proxy.ts
import { createProxy } from 'next-tongue/proxy';

export const proxy = createProxy();
export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] };
```

> **Matcher caveat:** `.*\\..*` skips every path containing a dot, so `/de/blog/v1.2` bypasses the proxy (no locale redirect). If you have dotted routes, exclude only real file extensions, e.g. `'/((?!api|_next|.*\\.(?:ico|png|jpg|svg|txt|xml|webmanifest)$).*)'`.

All pages live under `app/[locale]/`. The proxy guarantees that by the time a request reaches the app, the `[locale]` segment is a valid locale.

## What the proxy does

1. If the pathname starts with a known locale prefix → pass through (and refresh the locale cookie if enabled).
2. Otherwise, determine the locale: domain match → cookie → `Accept-Language` → `defaultLocale`.
3. `prefix: 'always'` → **redirect** to `/{locale}/...`.
   `prefix: 'as-needed'` → for the default locale, **rewrite** internally to `/{defaultLocale}/...`; otherwise redirect. A request for `/{defaultLocale}/x` is **redirected (308) to `/x`**, so each page has one canonical URL ([#30](https://github.com/MrLouisWright/next-tongue/issues/30)).
   `prefix: 'never'` (v0.4) → always **rewrite**.
4. Localized `pathnames` (v0.4) are mapped in both directions (`/de/ueber-uns` ↔ `/de/about`), using a route manifest generated from `app/` at codegen time.

**Performance:** codegen precomputes locale lookup tables at build time: exact tags, language/script/region parents, and the `Accept-Language` best-fit map. The proxy constructs no `Intl.*` objects per request, and caches parsed `Accept-Language` strings in a bounded LRU. With many locales, per-request matching in other setups has been reported at 120–180 ms for about 140 locales ([r/nextjs](https://www.reddit.com/r/nextjs/comments/1ozfz0q/nextintl_middleware_becomes_extremely_slow_with/)). next-tongue's target is p50 < 1 ms with 150 locales (ROADMAP v0.2).

**Cookie:** `TONGUE_LOCALE` is set with `SameSite=Lax` by default so it survives cross-site navigation; see [Configuration](configuration.md).

## Prefix strategies

| `prefix` | URL for `en` (default) | URL for `de` | Static-export friendly |
|---|---|---|---|
| `'always'` | `/en/about` | `/de/about` | ✅ (the only option for `output: 'export'`) |
| `'as-needed'` | `/about` | `/de/about` | ❌ (no proxy in static export; see [Static export](static-export.md)) |
| `'never'` | `/about` | `/about` (cookie/domain) | ❌ |

### CDN / caching caveats for `prefix: 'never'`

With `never`, the public URL has **no locale segment**. Locale comes from the cookie, `Host` (domains), or `Accept-Language`, and the proxy **rewrites** to `/{locale}/…` internally.

- Cache keys must include the locale cookie (and preferably `Host` / `Vary: Cookie, Accept-Language, Host`). Otherwise a CDN can serve a German rewrite to an English visitor.
- Prefer `routing.domains` (one locale per host) when you need edge caching without cookie variance.
- Static export cannot use `never` (no proxy).

## Domains

```ts
routing: {
  domains: [
    { domain: 'example.com', defaultLocale: 'en', locales: ['en'] },
    { domain: 'example.de', defaultLocale: 'de', locales: ['de'] },
  ],
}
```

Pass the same `domains` array into `createProxy({ domains })`. Detection order: domain → cookie → `Accept-Language` → domain/default locale.

## Localized pathnames

```ts
routing: {
  pathnames: {
    '/about': { de: '/ueber-uns', fr: '/a-propos' },
  },
}
```

The proxy rewrites `/de/ueber-uns` → `/de/about` (App Router file path) and navigation helpers emit the localized public URL. Pass `pathnames` to both `createProxy` and `createNavigation`.

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
