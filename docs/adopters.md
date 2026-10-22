# Adopters & production-like verification

Tracks the v0.9 freeze AC: *no breaking changes for 4 weeks; 3+ external production-like apps report success* (timer starts when `0.9.x` is live on npm).

## In-repo production-like apps (verified 2026-10-17)

`next build` succeeded against `packages/next-tongue` on `main` (includes the Turbopack `next/root-params` isolation fix):

| App | Shape | Result |
|---|---|---|
| `examples/basic` | as-needed proxy, preferences, contact action | ✅ SSG |
| `examples/routing` | pathnames / domains routing | ✅ SSG |
| `examples/cache-components` | Cache Components + PPR | ✅ PPR |
| `examples/static-export` | `output: 'export'`, `prefix: 'always'` | ✅ static |
| `examples/og-email` | OG images + email route, RTL `ar` | ✅ SSG + dynamic |

These are first-party, not external. They prove the surfaces an adopter hits; they do **not** close the external-apps checkbox alone.

## External

| App / org | Contact | Version | Notes |
|---|---|---|---|
| Noticed Sites | (beta feedback through 2026-10-18) | 0.9.7–0.9.15 | Next 16, ~960 keys, 4 locales; hybrid `[locale]` + root API/auth; root TongueShell. Drove loader/`useLocale` import fix (0.9.12), `t.dynamic`, reserved keys, `requestLocale`, hybrid docs, auto `ensureTongue`. |
| Hallume | (beta feedback through 2026-10-18) | 0.9.14–0.9.15 | Existing root `app/layout.tsx` (theme/CSP); hybrid chrome + HtmlLang; `--proxy merge` / CSP `mergeProxyResponse` / `wrapResponse`; maintenance rewrite vs `[locale]`; `t.rich` ReactNode; Href query/hash; server footer vs client `useT`. |
| louiswright.co.uk | (beta feedback 2026-10-18) | 0.9.15→0.9.16 | Next 16, existing root layout + CSP proxy, hybrid `[locale]`. Drove `#tongue/*` → `*.js` imports, static `#tongue/runtime` + globalThis server state, `next-tongue/navigation/server`, `t.dynamic` `[...KEYS]`, clearer `TONGUE_E_NOT_REWRITTEN`, getT scanner hardening. |
| Serpfull | (beta feedback 2026-10-22) | 0.9.16→0.9.18 | Marketing + ~973 keys, EN/ES, Next 16 PPR, server actions, client forms. Drove leaf/branch key docs + collision errors, EN apostrophe+`{…}` ICU hints, richer mismatch diagnostics, `t.dynamic` enum / escape / PPR Suspense / server-action recipes. |

File an issue with label `adopter` or a PR updating this table.

## Freeze checklist

1. [x] `0.9.x` live on npm (through `0.9.7`; `0.9.8` ships adopter fixes)
2. [x] Freeze start: **2026-10-17** (first documented installable `0.9.x` on npm)
3. [x] Three external production-like apps listed above *(3/3 — Noticed Sites, Hallume, louiswright.co.uk)*
4. [ ] No breaking public-API changes for 4 weeks from freeze start *(quiet until ~2026-11-14)*

---
[Releasing](releasing.md) · [API freeze](api-freeze.md) · [Roadmap](../ROADMAP.md)
