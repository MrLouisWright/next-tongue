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

### Existing-site checklist

Wire next-tongue into an app that already owns root layout + proxy:

1. **package.json** `"imports": { "#tongue/*": "./.tongue/*.js" }` (Node needs the `.js` suffix) and **tsconfig** `paths` + `include: [".tongue/types.d.ts"]`.
2. **`"build": "tongue build && next build"`** (and the same for Vercel).
3. Keep **`<html>` on the root layout**; `[locale]/layout` only wraps `TongueProvider` (+ `import { localeParams } from '#tongue/runtime'` — required side-effect for `ensureTongue` / `getT`).
4. **HtmlLang** client sync for `lang`/`dir` (a11y accepts the name).
5. Proxy: **`mergeProxyResponse` / `wrapResponse`** for CSP/nonce; allow-list `/api` + feeds before tongue ([partial localization](#partial-localization-hybrid-routing)).
6. Server chrome (Footer): **`getT`** or `next-tongue/navigation/server` — do not import client `createNavigation` into Server Components.
7. Under `as-needed`, plain **`next/link`** with unprefixed hrefs is fine for root chrome.

### Existing root layout (`app/layout.tsx`)

Next.js allows `<html>` **only** on the root layout. If you already have `app/layout.tsx` / `src/app/layout.tsx` (theme boot, CSP nonce, providers), **do not** put `<html>` under `[locale]` — scaffolding a nested `<html>` fails. Keep the root document; nest `TongueProvider` only under `[locale]`. `tongue init` detects a root layout and scaffolds the nested layout without `<html>`.

`tongue check` a11y looks at the **root** layout when it sits beside `[locale]`, and accepts `HtmlLang` by name (or `document.documentElement.lang` / `dir` sync). You do not need `strict.a11y: 'off'` for that pattern. Full recipe: [Root-layout chrome](#root-layout-chrome-header--footer-outside-locale).

**Static import of `#tongue/runtime`:** put `import { localeParams } from '#tongue/runtime'` (and `export const generateStaticParams = localeParams`) on the `[locale]` layout. Relying only on getT’s dynamic import can wire a *different* `next-tongue/server` instance in some Turbopack graphs (`TONGUE_E_TYPES_MISSING`). 0.9.16 stores runtime state on `globalThis` so lazy load works, but the static import remains the recommended production pattern. The build table may show `ƒ` instead of `●` after that import — with Proxy / hybrid layouts Next often labels routes dynamic even when `generateStaticParams` still emits pages; confirm with the actual HTML, not only the legend.

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

**First-class hybrid recipe** for apps that already own `app/layout.tsx` (theme, CSP, global providers) and cannot move `<html>` into `[locale]`:

1. Keep `<html>` on the root layout (`suppressHydrationWarning` if a client syncs `lang`/`dir`).
2. Optional root `TongueShell` only if Header/Footer need `useT` / `useLocale` outside `[locale]`.
3. Sync `document.documentElement.lang` / `dir` with `HtmlLang` (below). `tongue check` a11y accepts a component named `HtmlLang`.
4. Under `app/[locale]/layout.tsx`: `TongueProvider` with `params.locale` only — **no** nested `<html>`. Prefer `devOverlay={false}` if the root shell already shows the overlay.

```tsx
// app/layout.tsx (root) — you keep theme / CSP here
import { TongueShell } from './tongue-shell';
import { HtmlLang } from './html-lang';
import { SiteFooter } from './site-footer'; // prefer server getT — see below

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <TongueShell>
          <HtmlLang />
          <Header />
          {children}
          <SiteFooter />
        </TongueShell>
      </body>
    </html>
  );
}
```

```tsx
// app/html-lang.tsx
'use client';
import { useEffect } from 'react';
import { useLocale, getDir } from 'next-tongue/client';

/** tongue check a11y accepts this name on the root layout tree. */
export function HtmlLang() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = getDir(locale);
  }, [locale]);
  return null;
}
```

```tsx
// app/tongue-shell.tsx — only if root chrome uses useT / useLocale
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

```tsx
// app/[locale]/layout.tsx — nested provider only
import { notFound } from 'next/navigation';
import { TongueProvider } from 'next-tongue/client';
import { isLocale } from 'next-tongue/server';
import { localeParams } from '#tongue/runtime';

export const generateStaticParams = localeParams;

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <TongueProvider locale={locale} devOverlay={false}>
      {children}
    </TongueProvider>
  );
}
```

**Server footer (prefer this over `useT` in root chrome):** moving a footer to `useT` pulls `"use cache"` / server-only children into the client graph. Keep year, copyright, and static chrome on the server:

```tsx
// app/site-footer.tsx — Server Component
import { cookies } from 'next/headers';
import { getT } from 'next-tongue/server';
import { defaultLocale, locales } from '#tongue/runtime';

export async function SiteFooter() {
  const jar = await cookies();
  const raw = jar.get('TONGUE_LOCALE')?.value;
  const locale =
    raw && (locales as readonly string[]).includes(raw) ? raw : defaultLocale;
  const t = await getT(locale, 'footer');
  return (
    <footer>
      <p>{t('copyright', { year: new Date().getFullYear() })}</p>
    </footer>
  );
}
```

**Nested providers:** intentional when root chrome needs a locale *and* `[locale]` pages need `params`-accurate locale. Prefer one provider only if all chrome lives under `[locale]`. Do not nest three deep.

Client `useT` in root chrome needs the call-site loader on the SSR graph (0.9.5+) — do **not** add a bare `useLocale()` “for the loader”; the loader injects `__tongue_locale` and imports `useLocale`. Call `useLocale()` only when you need the string (HtmlLang, fetch headers).

### Navigation: `createNavigation` vs plain `next/link`

`next-tongue/navigation` is a **Client Module** (`'use client'`). Importing `createNavigation` / `Link` from a shared `lib/i18n/navigation.ts` into a **Server Component** (Footer, Button, not-found) throws *Attempted to call createNavigation() from the server*.

| Style | Use |
|---|---|
| `next-tongue/navigation` `createNavigation` | Client components — Link, useRouter, usePathname, LocaleSwitcher |
| `next-tongue/navigation/server` `createNavigation` | Server Components — `Link` requires explicit `locale` prop; redirect / getPathname |
| Plain `next/link` + unprefixed hrefs | as-needed apps that rely on the proxy (often simplest for root chrome) |

With `prefix: 'as-needed'`, unprefixed paths (`/submit`, `/dashboard`) plus the proxy are valid.

**Query strings and hashes:** tongue `Link` / `getPathname` preserve `?` and `#`. Prefer the object form with typed pathnames:

```tsx
<Link href={{ pathname: '/dashboard', query: { demo: '1' } }} />
<Link href={{ pathname: '/cookies', hash: 'preferences' }} />
// also fine: href="/dashboard?demo=1" or href="/cookies#preferences"
```

Use plain `next/link` when the href is intentionally outside locale routing (external, hash-only, or a root path the proxy allow-lists). Mixing both is OK if you are deliberate — do not expect tongue `Link` to accept Next’s `{ pathname, query }` object shape; use tongue’s `PathnameInput`.

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

- Adds `import { createProxy, mergeProxyResponse } from 'next-tongue/proxy'` and `const tongue = createProxy({…})`.
- Replaces the **final** `return NextResponse.next()` with `return tongue(req)` (early allow-list `next()` returns stay).
- If there is no `next()` return, wraps the exported handler: **non-passthrough** user `Response` wins; passthrough `next()` → tongue, then `mergeProxyResponse` so CSP/nonce on the user `next()` are kept.

Use `--proxy overwrite` only when you want the greenfield scaffold instead. Or compose by hand:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createProxy, mergeProxyResponse } from 'next-tongue/proxy';

const tongue = createProxy({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  prefix: 'as-needed',
  // Re-stamp CSP after tongue when you build the policy in one place:
  // wrapResponse(res) { … copy nonce onto res …; return res; },
});

export async function proxy(req: NextRequest) {
  // Auth / marketing allow-list first — these return real Responses (not next()).
  if (req.nextUrl.pathname.startsWith('/admin') && !req.cookies.get('session')) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // CSP on next() is lost if you only `return tongue(req)`. Merge or wrapResponse:
  const prior = NextResponse.next();
  prior.headers.set('Content-Security-Policy', "script-src 'nonce-…'");
  return mergeProxyResponse(prior, await tongue(req));
}
```

### Maintenance / auth rewrites vs `[locale]`

`--proxy merge` **skips tongue** when your handler returns a non-passthrough response (redirect, rewrite, JSON). That is correct for `/api` allow-lists — and a trap after you move pages under `app/[locale]/`:

```ts
// After the move, this 404s: there is no app/maintenance — only app/[locale]/maintenance
if (isDown) return NextResponse.rewrite(new URL('/maintenance', req.url));
```

Pick one:

| Approach | When |
|---|---|
| Keep `/maintenance` (and login) **outside** `[locale]` and return rewrite/redirect **before** tongue | Status / auth pages that must not be locale-prefixed |
| Rewrite to `/${locale}/maintenance` (or call tongue first, then rewrite) | Localized maintenance UX |
| Let tongue run, then rewrite in `wrapResponse` | You need locale detection *and* a custom target |

Same idea for auth: `/login` under `[locale]` needs a locale segment (or an allow-listed root route). Document allow-lists next to compose examples so merge mode does not silently bypass locale routing for paths that now live under `[locale]`.

### CSP / response headers

Tongue builds its own `Response` (rewrite / redirect / `x-middleware-next`). Headers you set on a prior `NextResponse.next()` are **not** visible to `createProxy` unless you:

1. **`mergeProxyResponse(prior, await tongue(req))`** — copy CSP, nonce, custom headers onto tongue’s response (used by `--proxy merge` wrap), or
2. **`createProxy({ wrapResponse })`** — stamp headers on every tongue result (run tongue first/last in one place), or
3. Stamp CSP **after** tongue in your own compose function.

Optional: `localeDetection`, `resolveLocale`, `onLocale`, `pathnames`, `domains`, `excludeFromDetection`, `wrapResponse`.

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
