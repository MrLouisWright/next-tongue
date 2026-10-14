# 0002. Locale comes from route params only

- Status: Accepted
- Date: 2026-10-14

## Context
With `cacheComponents: true`, `headers()`/`cookies()` make a scope dynamic and are disallowed in `'use cache'`. Libraries that resolve locale from request data inside render break static shells (see amannn/next-intl#1493, #2412).

## Decision
Only `proxy.ts` reads request data. It redirects/rewrites so every page lives under `app/[locale]`. All server APIs take `locale` as an explicit argument; client APIs read it from `TongueProvider`, which receives it from params. No header-reading `getLocale()` exists.

## Consequences
- \+ Every translated scope is cacheable and prerenderable; locale is naturally part of cache keys.
- \+ Works with `output: 'export'` and `dynamicParams = false`.
- − Slightly more verbose: `getT(locale, ns)` and passing `locale` as props.
- − `prefix: 'never'` relies on rewrites, so URLs are not self-describing for caches/CDNs; documented.

## Alternatives considered
`setRequestLocale`-style per-request store (React `cache()`); works for static rendering but is easy to forget and opaque inside `'use cache'`.
