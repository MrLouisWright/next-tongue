> 📄 Mirrors [`docs/troubleshooting.md`](https://github.com/MrLouisWright/next-tongue/blob/main/docs/troubleshooting.md) in the main repo — the repo version is canonical.

# Troubleshooting

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](Roadmap).

| Symptom | Cause | Fix |
|---|---|---|
| `Route "/[locale]" used headers() inside "use cache"` | Your code (not next-tongue) reads headers in a cached scope | Move the read into a Suspense'd dynamic component; get locale from params |
| Type error: `Argument of type 'string' is not assignable to parameter of type 'Locale'` | Raw `params.locale` passed to `getT` | `if (!isLocale(locale)) notFound();` |
| `TONGUE_E_TYPES_MISSING` | `.tongue/types.d.ts` missing from tsconfig `include` or not generated | Run `npx tongue build`; check `include` |
| `TONGUE_E_ICU_SYNTAX` at build | Invalid ICU in a message file | Error shows file:key:column; quote literal braces with `'{'` |
| `TONGUE_E_DYNAMIC_KEY` | `t(variable)` with no declared key set | `t.dynamic(key, { from: [...] })` or `t.ns(ns)` |
| `TONGUE_W_ESCAPE` | `t` passed as a prop/argument or returned, so the loader cannot see its keys | Pass strings instead, or accept the whole namespace shipping |
| `/de/blog/v1.2` not localized | Default matcher skips paths with a dot | Use the extension-only matcher in [Routing & proxy](Routing-and-Proxy) |
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
| `TONGUE_W_TIMEZONE` | client runtime (dev) | `useFormat()` would format a date in a different zone than the server did; this would cause a hydration mismatch ([ADR 0008](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0008-explicit-time-zone.md)) |

## Known upstream Next.js issues

| Symptom | Upstream |
|---|---|
| Localized dynamic segments (`/[locale]/x/[id]`) not cached with Cache Components | [vercel/next.js#86870](https://github.com/vercel/next.js/issues/86870), [#85240](https://github.com/vercel/next.js/issues/85240) |
| `next/root-params` types missing with two root layouts | [vercel/next.js#96756](https://github.com/vercel/next.js/issues/96756) — keep explicit `getT(locale, ns)`; only enable `routing.rootParams` with a single `[locale]` root layout ([ADR 0007](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0007-root-params-not-default.md)) |

Still stuck? Open an issue with the output of `npx tongue check --json` and your `tongue.config.ts`.
