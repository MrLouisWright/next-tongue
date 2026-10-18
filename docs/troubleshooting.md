# Troubleshooting

> **Status: beta 0.9 (API freeze).** Install `next-tongue` from npm. See [ROADMAP](../ROADMAP.md) and [API freeze](api-freeze.md).

| Symptom | Cause | Fix |
|---|---|---|
| `Route "/[locale]" used headers() inside "use cache"` | Your code (not next-tongue) reads headers in a cached scope | Move the read into a Suspense'd dynamic component; get locale from params |
| Type error: `Argument of type 'string' is not assignable to parameter of type 'Locale'` | Raw `params.locale` passed to `getT` | `if (!isLocale(locale)) notFound();` |
| `TONGUE_E_TYPES_MISSING` | `.tongue/types.d.ts` missing from tsconfig `include` or not generated | Run `npx tongue build`; check `include` |
| `TONGUE_E_ICU_SYNTAX` at build | Invalid ICU in a message file | Error shows file:key:column; quote literal braces with `'{'` |
| `TONGUE_E_DYNAMIC_KEY` | `t(variable)` with no declared key set | `t.dynamic(key, { from: [...] })` or `t.ns(ns)` |
| `TONGUE_W_ESCAPE` | `t` passed as a prop/argument or returned, so the loader cannot see its keys | Pass strings instead, or accept the whole namespace shipping |
| `/de/blog/v1.2` not localized | Default matcher skips paths with a dot | Use the extension-only matcher in [Routing & proxy](routing-and-proxy.md) |
| `/en/about` and `/about` both indexed | Old setup without canonical redirect | `as-needed` redirects `/en/*` → `/*` ([#30](https://github.com/MrLouisWright/next-tongue/issues/30)) |
| Shell not static under `cacheComponents` | Root `[locale]` layout lacks `generateStaticParams` | `export const generateStaticParams = localeParams` |
| Redirect loop | `matcher` also matches already-prefixed assets, or a host redirect fights `prefix` | Exclude `_next`, files, `api`; align host rules |
| 404 for `/` with `output: 'export'` | No proxy in static export | `tongue init --export` root page or host redirect |
| `TONGUE_E_NO_PROVIDER: useT must be used within TongueProvider` | Provider missing in layout | Add `TongueProvider` to `app/[locale]/layout.tsx` |
| Wrong locale after switching | Stale locale cookie | Switcher uses `<Link locale>`, which updates the cookie via proxy |

## Error codes (planned)

| Code | Raised by | Meaning |
|---|---|---|
| `TONGUE_E_CONFIG` | `withTongue`, CLI | Invalid `tongue.config.ts` (message lists the field) |
| `TONGUE_E_ICU_SYNTAX` | compiler | ICU parse error |
| `TONGUE_E_MISMATCH` | compiler, `check` | Args/tags/plural categories differ from default locale |
| `TONGUE_E_MISSING` | compiler, `check` | Key missing in a locale (when `strict.missing: 'error'`) |
| `TONGUE_E_DYNAMIC_KEY` | loader | Non-literal key without a declared key set |
| `TONGUE_W_ESCAPE` | loader | `t` escapes the file; whole namespace included |
| `TONGUE_E_TYPES_MISSING` | types | Generated types not found |
| `TONGUE_E_UNSUPPORTED_ICU` | compiler | ICU construct outside the supported subset |
| `TONGUE_E_LOCALE` | server | Invalid locale passed to an action helper |
| `TONGUE_E_NO_PROVIDER` | client runtime | `useT`/`useLocale` outside `TongueProvider` |
| `TONGUE_W_TIMEZONE` | client runtime (dev) | `useFormat()` would format a date in a different zone than the server did; this would cause a hydration mismatch ([ADR 0008](adr/0008-explicit-time-zone.md)) |

## Known upstream Next.js issues

| Symptom | Upstream |
|---|---|
| Localized dynamic segments (`/[locale]/x/[id]`) not cached with Cache Components | [vercel/next.js#86870](https://github.com/vercel/next.js/issues/86870), [#85240](https://github.com/vercel/next.js/issues/85240) |
| `next/root-params` types missing with two root layouts | [vercel/next.js#96756](https://github.com/vercel/next.js/issues/96756) — keep explicit `getT(locale, ns)`; only enable `routing.rootParams` with a single `[locale]` root layout ([ADR 0007](adr/0007-root-params-not-default.md)) |
| Turbopack: `next/root-params` can only be used inside the App Directory (from `proxy.ts` / middleware) | Fixed in `0.9.1`: server code loads `next/root-params` only via a non-static import when `routing.rootParams` is on. Upgrade, or avoid importing `next-tongue/server` from middleware (prefer `#tongue/runtime` + `next-tongue/proxy` only). |
| `createProxy()` type/runtime error | Pass `{ locales, defaultLocale, prefix? }` — zero-arg form is invalid |
| `#tongue/*` not found in `tsc` | Add `compilerOptions.paths["#tongue/*"] = ["./.tongue/*"]` (`tongue init` does this); `package.json` `imports` alone is not enough for TypeScript |
| `<html>` in `app/[locale]/layout` with existing root layout | Invalid in Next — keep `<html>` on root layout; nest `TongueProvider` only under `[locale]` |
| `/de/…` 404 on non-localized routes | No partial-localization config — gate in your proxy allow-list and only put localized pages under `[locale]` |
| Existing `turbopack.rules` for `*.tsx` | `withTongue` **appends** the tongue loader to that glob (array merge); it does not remove your rules |
| `getServerSnapshot` infinite loop / overlay | Fixed in `0.9.4` (cached snapshot). `0.9.5` also defers `notify()` via `queueMicrotask` so `t()` during render does not update DevOverlay mid-render. Or `devOverlay={false}` |
| `useT` SSR without rewrite / still needs `loadNamespace` | `0.9.5`: Turbopack loader is no longer `browser`-only (SSR graph gets rewrites). Prefer server `getT` for root chrome; see [root-layout chrome](routing-and-proxy.md#root-layout-chrome-header--footer-outside-locale) |
| `tongue check` unused / false missing keys | `0.9.5`: ignores comments; does not treat unrelated string arrays (cache tags) as keys. Use `t.dynamic(key, { from })` for dynamic keys |
| `TONGUE_E_PARSE` on copy with `<id>` | Angle brackets are rich tags — apostrophe-escape: `"data-ns=\"'<id>'\""` ([ICU messages](icu-messages.md)) |
| Next 500 / `"use client"` after loader | Fixed in `0.9.6`: loader re-hoists `"use client"` / `"use server"` before injected imports. Remove any `postinstall` patch that only re-hoisted the directive |
| `t.dynamic` throws without `loadNamespace` | Fixed in `0.9.6` for inline `from: [...]`. `0.9.7` also resolves same-file `const FROM = [...]` and `Object.values(OBJ)`. Imported `from` still needs an inline/same-file list |
| `t(variable)` blows up in prod / passes typecheck | Client `useT`: always use `t.dynamic(key, { from })`. `0.9.8` `tongue check` reports these as `dynamic` errors |
| Unused keys that `getT` definitely uses | Scanner defaults now include `lib/`, `server/`, `actions/`; set `scan.include` if needed. Intentional leftovers: `strict.unusedIgnore` |
| `.tongue/ns/*.js` syntax error (`continue: continue`) | Reserved message keys sanitized in `0.9.8` (`continue` → export `continue_`) |
| `ENOTEMPTY` / locked `.tongue` during `tongue build` | `0.9.8` writes to a staging dir then renames; if it still fails, delete `.tongue` and `.tongue.tmp-*` and retry |
| Nested `TongueProvider` / root chrome | Hybrid (root shell + `[locale]` provider) is OK — see [Routing](routing-and-proxy.md#root-layout-chrome-header--footer-outside-locale). Set `devOverlay={false}` on the inner tree |
| Bare `useLocale()` “for the loader” | Unnecessary — loader injects `__tongue_locale`. Call `useLocale` only when you need the value |
| API route has no locale | `requestLocale(req, { locales, defaultLocale })` — `x-locale` → `TONGUE_LOCALE` → default |
| Stale `.tongue` / wrong codegen on Vercel | `"build": "tongue build && next build"` (and `vercel-build`) |
| Partial i18n 404 / `[locale]` eats `/api` | Allow-list first segments; only call `createProxy` for localized paths — [partial localization](routing-and-proxy.md#partial-localization-hybrid-routing) |

Still stuck? Open an issue with the output of `npx tongue check --json` and your `tongue.config.ts`.

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
