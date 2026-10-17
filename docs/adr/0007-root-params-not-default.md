# 0007. `next/root-params` is not a default locale source (opt-in at v0.9)

- Status: Accepted (amended 2026-10-17)
- Date: 2026-10-14
- Amended: 2026-10-17 ([#24](https://github.com/MrLouisWright/next-tongue/issues/24))

## Context
Next.js 16.3 shipped [`next/root-params`](https://nextjs.org/docs/app/api-reference/functions/next-root-params), which lets a Server Component read a root segment such as `[locale]` without prop drilling. Other libraries are adopting it to drop the explicit locale argument: Lingui updated its RSC example ([lingui/js-lingui#2645](https://github.com/lingui/js-lingui/issues/2645)), next-i18next proposed resolving the language from root params before `headers()` ([i18next/next-i18next#2345](https://github.com/i18next/next-i18next/issues/2345)), and next-intl's Cache Components support depends on it ([amannn/next-intl#1493](https://github.com/amannn/next-intl/issues/1493)).

`getT(locale, ns)` with an explicit locale ([ADR 0002](0002-locale-from-params-only.md)) is the most-cited verbosity cost of next-tongue. Upstream sharp edges as of the v0.9 re-evaluation:

| Issue | Status (2026-10-17) | Impact |
|---|---|---|
| Turbopack exports empty with `rootParams: true` ([vercel/next.js#92744](https://github.com/vercel/next.js/issues/92744)) | **Closed** | Fixed by placing the root layout inside `[locale]` (no sibling `app/layout.tsx`). |
| Stale `"use cache"` after client locale switch ([vercel/next.js#98493](https://github.com/vercel/next.js/issues/98493)) | **Closed** | Fixed in Next ≥ 16.3.8 via root-param vary tracking ([PR #98718](https://github.com/vercel/next.js/pull/98718)). Prefer that release when enabling the opt-in. |
| No generated types with two root layouts, one serving `/` ([vercel/next.js#96756](https://github.com/vercel/next.js/issues/96756)) | **Open** | Typegen writes "No root params detected"; runtime still works. Common for marketing `/` + `[locale]/*`. |

## Decision
- The explicit locale stays **canonical**: `getT(locale, ns)`, `getFormat(locale)`, `TongueProvider locale`.
- **Opt-in** (v0.9): set `routing.rootParams: true` in `tongue.config`. Then:
  - `getT(ns)` and `getFormat()` resolve the locale from `next/root-params` (`locale()`).
  - `withTongue` sets `experimental.rootParams: true` on the Next config.
  - Codegen passes `rootParams: true` into `ensureTongue` / `__setServerRuntime`.
- Apps with **two sibling root layouts** (one serving `/`) should keep the explicit-locale API until [vercel/next.js#96756](https://github.com/vercel/next.js/issues/96756) lands; runtime may work but types will not.
- next-tongue never reads `next/root-params` unless the opt-in flag is set.

## Consequences
- \+ Verbosity drop for the common single-`[locale]`-root-layout shape, without forcing it on everyone.
- \+ Explicit-locale signature and cache-key story unchanged for default configs.
- − Two-root-layout apps stay on the verbose API until upstream typing is fixed.
- − Opt-in apps should run Next ≥ 16.3.8 so locale switches under `"use cache"` stay correct.

## Alternatives considered
- **Adopt root params as the default.** Rejected while #96756 remains open and while many apps keep a marketing layout at `/`.
- **Use a React `cache()` request store** (`setRequestLocale` style). Already rejected in ADR 0002.
