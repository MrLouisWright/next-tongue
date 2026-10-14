# 0007. `next/root-params` is not a default locale source (revisit at v0.9)

- Status: Accepted
- Date: 2026-10-14

## Context
Next.js 16.3 shipped [`next/root-params`](https://nextjs.org/docs/app/api-reference/functions/next-root-params), which lets a Server Component read a root segment such as `[locale]` without prop drilling. Other libraries are adopting it to drop the explicit locale argument: Lingui updated its RSC example ([lingui/js-lingui#2645](https://github.com/lingui/js-lingui/issues/2645)), next-i18next proposed resolving the language from root params before `headers()` ([i18next/next-i18next#2345](https://github.com/i18next/next-i18next/issues/2345)), and next-intl's Cache Components support depends on it ([amannn/next-intl#1493](https://github.com/amannn/next-intl/issues/1493)).

`getT(locale, ns)` with an explicit locale ([ADR 0002](0002-locale-from-params-only.md)) is the most-cited verbosity cost of next-tongue. But in 2026 the API still had sharp edges, all reported upstream:
- Turbopack build: `next/root-params` had no exports with `rootParams: true` ([vercel/next.js#92744](https://github.com/vercel/next.js/issues/92744), closed).
- No generated types when an app has two root layouts and one serves `/` ([vercel/next.js#96756](https://github.com/vercel/next.js/issues/96756), open). That is a common layout for a marketing site plus `[locale]`.
- A stale `"use cache"` segment after a client navigation that changes a root param, which showed the wrong language in production ([vercel/next.js#98493](https://github.com/vercel/next.js/issues/98493), closed).

## Decision
- The explicit locale stays canonical: `getT(locale, ns)`, `getFormat(locale)`, `TongueProvider locale`.
- next-tongue does **not** read `next/root-params` implicitly in v0.x.
- At v0.9 (API freeze) we re-evaluate an **opt-in** overload, `getT(ns)`. It would resolve the locale from `next/root-params` only when `routing.rootParams: true` is set, and would be gated on the tests in [#24](https://github.com/MrLouisWright/next-tongue/issues/24). Whatever we ship, the explicit-locale signature stays.

## Consequences
- \+ No dependence on an API whose cache-key and typing behaviour was still changing; locale stays a plain function argument and cache key.
- \+ Works identically under webpack, Turbopack, `output: 'export'`.
- − Stays more verbose than libraries that adopt root params. `tongue migrate` keeps inserting `locale` arguments.

## Alternatives considered
- **Adopt root params now as the default.** Rejected because of the open typing bug and the recent stale-cache bug listed above.
- **Use a React `cache()` request store** (`setRequestLocale` style). Already rejected in ADR 0002.
