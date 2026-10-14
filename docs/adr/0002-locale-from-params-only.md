# 0002. Locale comes from route params only

- Status: Accepted
- Date: 2026-10-14 (amended 2026-10-14: server actions, routes outside `[locale]`, `localeParams`)

## Context
With `cacheComponents: true`, `headers()`/`cookies()` make a scope dynamic and are disallowed in `'use cache'`. Libraries that resolve locale from request data inside render break static shells (see amannn/next-intl#1493, #2412).

## Decision
Only `proxy.ts` reads request data. It redirects/rewrites so every page lives under `app/[locale]`. All server APIs take `locale` as an explicit argument; client APIs read it from `TongueProvider`, which receives it from params. No header-reading `getLocale()` exists.

**Server actions and route handlers** receive no `params`. The locale is passed explicitly: as a bound argument (`action.bind(null, locale)`) or a hidden form field, and validated with `isLocale()` before use. Route handlers outside `[locale]` take the locale from the URL or the request body, never implicitly. See [Server actions](../server-actions.md) and [#26](https://github.com/MrLouisWright/next-tongue/issues/26).

**Outside `[locale]`** (global `app/not-found.tsx`, the static-export root `app/page.tsx`, `app/api/*`): there is no provider and no locale param. Server code there must pass a locale explicitly (typically `defaultLocale`). Client `useT`/`useLocale` without a `TongueProvider` throws `TONGUE_E_NO_PROVIDER`; wrap such trees in `<TongueProvider locale={defaultLocale}>` deliberately.

**Static shell:** under `cacheComponents`, `params` are runtime data unless `generateStaticParams` is exported. The root `app/[locale]/layout.tsx` must export `generateStaticParams = localeParams`; `tongue init` writes it and `withTongue` warns when it is missing. Nested dynamic segments need their own `generateStaticParams`.

## Consequences
- \+ Every translated scope is cacheable and prerenderable; locale is naturally part of cache keys.
- \+ Works with `output: 'export'` and `dynamicParams = false`.
- − Slightly more verbose: `getT(locale, ns)` and passing `locale` as props. Mitigated by `createTranslator(locale)` per page and a typed `LocaleProps` helper.
- − Server actions need an explicit, validated locale argument.
- − `prefix: 'never'` relies on rewrites, so URLs are not self-describing for caches/CDNs; documented.

## Alternatives considered
`setRequestLocale`-style per-request store (React `cache()`); works for static rendering but is easy to forget and opaque inside `'use cache'`.
