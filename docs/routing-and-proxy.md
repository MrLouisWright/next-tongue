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
// after tongue build — single source of truth (no hardcoding locales/prefix)
import { createProxy } from 'next-tongue/proxy';
import { routing } from '#tongue/runtime'; // { locales, defaultLocale, prefix }

export const proxy = createProxy(routing);
```

Same `routing` object feeds `createNavigation(routing)` and client shells (pathname locale allow-list) so tongue.config is the only place that lists locales.

> **Matcher caveat (common gotcha):** a catch-all `.*\\..*` skips **every** path with a dot — including content slugs like `/legal/foo.bar` or `/blog/v1.2`. Prefer excluding only static file extensions, e.g. `'/((?!api|_next|.*\\.(?:ico|png|jpg|jpeg|gif|svg|txt|xml|webmanifest|css|js|map|woff2?)$).*)'`, or drop the dot rule entirely if you do not serve extensioned static files through the proxy.

Localized app routes live under `app/[locale]/` (or `src/app/[locale]/`). The proxy guarantees that by the time a request reaches those routes, the `[locale]` segment is a valid locale.

### Existing root layout (`app/layout.tsx`)

Next.js allows `<html>` **only** on the root layout. If you already have `app/layout.tsx` / `src/app/layout.tsx`, keep `lang` / `dir` there (or sync with a small client helper). The `[locale]` layout should wrap with `TongueProvider` only — `tongue init` detects this and scaffolds accordingly. `tongue check` a11y accepts lang/dir on the root layout, or set `strict.a11y: 'off'`.

### Partial localization (hybrid routing)

Many production apps only localize marketing / app shells under `app/[locale]/…` and keep API, auth, media, badges, feeds at the **root**. next-tongue does **not** auto-detect that set — compose the proxy:

```ts
// lib/localized-segments.ts — shared with next.config rewrites
export const LOCALIZED_FIRST_SEGMENTS = new Set([
  'home', 'submit', 'dashboard', 'sites', // …your [locale] tree
]);

export function isLocalizedPath(pathname: string): boolean {
  const first = pathname.split('/').filter(Boolean)[0];
  if (!first) return true; // `/`
  if (['en', 'de', 'fr', 'es'].includes(first)) return true; // already prefixed
  return LOCALIZED_FIRST_SEGMENTS.has(first);
}
```

```ts
// proxy.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createProxy } from 'next-tongue/proxy';
import { isLocalizedPath } from './lib/localized-segments';

const tongue = createProxy({
  locales: ['en', 'de', 'fr', 'es'],
  defaultLocale: 'en',
  prefix: 'as-needed',
});

export function proxy(req: NextRequest) {
  if (!isLocalizedPath(req.nextUrl.pathname)) {
    return NextResponse.next(); // /api, /auth, /media, …
  }
  return tongue(req);
}
```

**Optional safety net:** duplicate the same first-segment list into `next.config` `rewrites().beforeFiles` so a bare `/dashboard` is rewritten to `/en/dashboard` when the proxy is skipped — otherwise Next may treat `dashboard` as `[locale]` and `notFound()`. Keep the allow-list, the `app/[locale]` tree, and rewrites in sync.

### Root-layout chrome (Header / Footer outside `[locale]`)

Shared chrome in `app/layout.tsx` has **no** `params.locale`. Recommended for existing apps that **cannot** move `<html>` into `[locale]`:

1. Keep `<html>` on the root layout.
2. Wrap Header/Footer in a `TongueShell` that supplies locale (cookie / pathname).
3. Sync `document.documentElement.lang` / `dir` with a small client `HtmlLang` (tongue check a11y accepts that, or `HtmlLang` by name).
4. Put a second `TongueProvider` under `[locale]/layout` with `params.locale` (accurate) and usually `devOverlay={false}` so only the root shell shows the overlay.

```tsx
// app/layout.tsx (root)
import { TongueShell } from './tongue-shell';
import { HtmlLang } from './html-lang';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <TongueShell>
          <HtmlLang />
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
// app/tongue-shell.tsx — client or server; cookie / pathname both work
'use client';
import { usePathname } from 'next/navigation';
import { TongueProvider } from 'next-tongue/client';
import { defaultLocale, locales } from '#tongue/runtime';

export function TongueShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '/';
  const first = path.split('/').filter(Boolean)[0];
  const locale =
    first && (locales as readonly string[]).includes(first) ? first : defaultLocale;
  return <TongueProvider locale={locale}>{children}</TongueProvider>;
}
```

**Nested providers:** intentional when root chrome needs a locale *and* `[locale]` pages need `params`-accurate locale. Prefer one provider only if all chrome lives under `[locale]`. Do not nest three deep.

**Alternatives:** translate on the server and pass strings into Header/Footer (no `useT` in root chrome). Client `useT` in root chrome needs the call-site loader on the SSR graph (0.9.5+) — do **not** add a bare `useLocale()` “for the loader”; `withTongue` injects `__tongue_locale` itself. Call `useLocale()` only when you need the string.

### Navigation: `createNavigation` vs plain `next/link`

With `prefix: 'as-needed'`, unprefixed paths (`/submit`, `/dashboard`) plus the proxy are valid. Pick **one** style:

| Style | Use |
|---|---|
| `createNavigation` `Link` / `usePathname` | Localized pathnames, locale switching, prefix always |
| Plain `next/link` + unprefixed hrefs | as-needed apps that rely on the proxy |

`createNavigation().usePathname()` already strips the locale prefix (and maps pathnames). If you keep `next/navigation`'s `usePathname`, use `usePathnameWithoutLocale(locales)` or `stripLocalePrefix` for active-state matching — do not hand-roll regexes.

## What the proxy does

1. If the pathname starts with a known locale prefix → pass through (and refresh the locale cookie if enabled).
2. Otherwise, determine the locale: domain match → cookie → `Accept-Language` → `defaultLocale`.
3. `prefix: 'always'` → **redirect** to `/{locale}/...`.
   `prefix: 'as-needed'` → for the default locale, **rewrite** internally to `/{defaultLocale}/...`; otherwise redirect. A request for `/{defaultLocale}/x` is **redirected (308) to `/x`**, so each page has one canonical URL ([#30](https://github.com/MrLouisWright/next-tongue/issues/30)).
   `prefix: 'never'` (v0.4) → always **rewrite**.
4. Localized `pathnames` (v0.4) are mapped in both directions (`/de/ueber-uns` ↔ `/de/about`), using a route manifest generated from `app/` at codegen time.

**Performance:** codegen precomputes locale lookup tables at build time: exact tags, language/script/region parents, and the `Accept-Language` best-fit map. The proxy constructs no `Intl.*` objects per request, and caches parsed `Accept-Language` strings in a bounded LRU. With many locales, per-request matching in other setups has been reported at 120–180 ms for about 140 locales ([r/nextjs](https://www.reddit.com/r/nextjs/comments/1ozfz0q/nextintl_middleware_becomes_extremely_slow_with/)). next-tongue's target is p50 < 1 ms with 150 locales (ROADMAP v0.2).

**Cookie:** `TONGUE_LOCALE` (`LOCALE_COOKIE_NAME` from `next-tongue/proxy` or `next-tongue/server`) is set with `SameSite=Lax` by default so it survives cross-site navigation. Route Handlers have no `params.locale` — resolve with `requestLocale(req, { locales, defaultLocale })` (header `x-locale` → cookie → default). See [Configuration](configuration.md) and [API routes](#api-routes--request-locale).

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

`tongue init` leaves an existing `proxy.ts` / `middleware.ts` alone by default (`--proxy skip`). Pass **`--proxy merge`** to wire `createProxy` into the file without wiping your logic:

- Adds `import { createProxy } from 'next-tongue/proxy'` and `const tongue = createProxy({…})`.
- Replaces the **final** `return NextResponse.next()` with `return tongue(req)` (early allow-list `next()` returns stay).
- If there is no `next()` return, wraps the exported `proxy` / `middleware` so a non-passthrough user `Response` wins, then falls back to tongue.

Use `--proxy overwrite` only when you want the greenfield scaffold instead. Or compose by hand:

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

## API routes / request locale

```ts
import { requestLocale, getT, LOCALE_COOKIE_NAME } from 'next-tongue/server';
import { cookies } from 'next/headers';
import { defaultLocale, locales } from '#tongue/runtime';

export async function POST(req: Request) {
  const locale = requestLocale(
    { headers: req.headers, cookies: await cookies() },
    { locales, defaultLocale },
  );
  const t = await getT(locale, 'checks');
  // …
}
```

Clients (wizard, fetch) should send `x-locale: de` when the cookie may be missing. Cookie name is always `TONGUE_LOCALE` unless you override `localeCookie.name` in `createProxy`.

## Build order (Vercel / CI)

Always compile messages before Next:

```json
{
  "scripts": {
    "build": "tongue build && next build",
    "vercel-build": "tongue build && next build"
  }
}
```

`withTongue` also runs codegen when Next loads config, but an explicit `tongue build` first avoids stale `.tongue` when install/build order skips config evaluation. Reserved message keys (`continue`, `default`, …) are sanitized to valid JS idents since 0.9.8 (`continue_`).

**`ensureTongue()`:** generated `#tongue/runtime` calls it on import, and `getT` / `getFormat` lazy-import that module if needed. Per-page `ensureTongue()` is optional when using `withTongue`.

## Not found

Add `app/[locale]/not-found.tsx` for localized 404s. Unknown locales should call `notFound()` in the root layout (`isLocale` helper). A global `app/not-found.tsx` handles requests the proxy did not match.

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
