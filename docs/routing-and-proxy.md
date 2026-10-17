# Routing & proxy

> **Status: beta 0.9.** Prefix strategies, pathnames and domains are implemented. See [ROADMAP](../ROADMAP.md).

Next.js 16 renamed `middleware.ts` to `proxy.ts` (exported function `proxy`, Node.js runtime). next-tongue does **all** request-dependent locale work there, so pages and layouts can stay static and cacheable. See [ADR 0002](adr/0002-locale-from-params-only.md).

## Setup

`createProxy` **requires** `locales` and `defaultLocale` (same values as `tongue.config.ts`). After `tongue build` you can import them from `#tongue/runtime`.

```ts
// proxy.ts (or src/proxy.ts)
import { createProxy } from 'next-tongue/proxy';

export const proxy = createProxy({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  prefix: 'as-needed', // match tongue.config routing.prefix
});

export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] };
```

```ts
// after tongue build — keep proxy in sync with config
import { createProxy } from 'next-tongue/proxy';
import { defaultLocale, locales } from '#tongue/runtime';

export const proxy = createProxy({ locales, defaultLocale, prefix: 'as-needed' });
```

> **Matcher caveat:** `.*\\..*` skips every path containing a dot, so `/de/blog/v1.2` bypasses the proxy (no locale redirect). If you have dotted routes, exclude only real file extensions, e.g. `'/((?!api|_next|.*\\.(?:ico|png|jpg|svg|txt|xml|webmanifest)$).*)'`.

Localized app routes live under `app/[locale]/` (or `src/app/[locale]/`). The proxy guarantees that by the time a request reaches those routes, the `[locale]` segment is a valid locale.

### Existing root layout (`app/layout.tsx`)

Next.js allows `<html>` **only** on the root layout. If you already have `app/layout.tsx` / `src/app/layout.tsx`, keep `lang` / `dir` there (or sync with a small client helper). The `[locale]` layout should wrap with `TongueProvider` only — `tongue init` detects this and scaffolds accordingly. `tongue check` a11y accepts lang/dir on the root layout, or set `strict.a11y: 'off'`.

### Partial localization

There is **no** first-class “only these pathnames are localized” option. Gate in your own `proxy` before calling tongue (allow-list marketing routes, skip `/api`, dashboards, etc.). A request like `/de/sites` will 404 unless that route exists under `[locale]` — keep the allow-list and `app/` tree aligned.

### Root-layout chrome (Header / Footer outside `[locale]`)

Shared chrome in `app/layout.tsx` has **no** `params.locale`. Patterns that work:

1. **Preferred — translate on the server and pass strings** into client chrome (no `useT` in the root layout).
2. **Path-based shell** — a small server wrapper that reads the locale from the URL (or cookie) and wraps children in `TongueProvider`:

```tsx
// app/layout.tsx (root)
import { TongueShell } from './tongue-shell';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">{/* or sync via client HtmlLang */}
      <body>
        <TongueShell>
          <Header />
          {children}
          <Footer />
        </TongueShell>
      </body>
    </html>
  );
}
```

```tsx
// app/tongue-shell.tsx — Server Component
import { cookies, headers } from 'next/headers';
import { TongueProvider } from 'next-tongue/client';
import { defaultLocale, locales } from '#tongue/runtime';

export async function TongueShell({ children }: { children: React.ReactNode }) {
  // Prefer a signed preference cookie / Host; fall back to default.
  // Do NOT call headers() inside a cached page — only in this dynamic shell.
  const cookieStore = await cookies();
  const raw = cookieStore.get('TONGUE_LOCALE')?.value;
  const locale =
    raw && (locales as readonly string[]).includes(raw) ? raw : defaultLocale;
  return (
    <TongueProvider locale={locale} /* loadNamespace only if bypassing the loader */>
      {children}
    </TongueProvider>
  );
}
```

3. **Nested `[locale]` provider** — keep marketing chrome untranslated, and put `TongueProvider` only under `app/[locale]/layout.tsx` for localized trees.

Client `useT` in root chrome needs the call-site loader on the **SSR** graph (enabled from 0.9.5) or an explicit `loadNamespace`. Prefer pattern 1 when possible.

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

`tongue init` does **not** overwrite an existing `proxy.ts` / `middleware.ts`. Compose:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createProxy } from 'next-tongue/proxy';

const tongue = createProxy({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  prefix: 'as-needed',
});

export async function proxy(req: NextRequest) {
  // your auth / marketing allow-list first
  if (req.nextUrl.pathname.startsWith('/admin') && !req.cookies.get('session')) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return tongue(req);
}
```

Optional: `localeDetection`, `resolveLocale`, `onLocale`, `pathnames`, `domains`, `excludeFromDetection`.

## Locale-aware navigation

Helpers come from **`createNavigation(config)`** — there is no unbound `Link` export.

```tsx
import { createNavigation } from 'next-tongue/navigation';

const { Link, redirect, useRouter, usePathname, getPathname } = createNavigation({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  prefix: 'as-needed',
  // pathnames: { '/about': { de: '/ueber-uns' } },
});

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
