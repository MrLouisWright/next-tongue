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
| Noticed Sites / Hallume | (beta feedback through 2026-10-18) | 0.9.7–0.9.15 | Next 16, ~960 keys, 4 locales; hybrid `[locale]` + root API/auth; root TongueShell. Drove loader/`useLocale` import fix (0.9.12), `t.dynamic`, reserved keys, `requestLocale`, hybrid docs, auto `ensureTongue`, `--proxy merge` + CSP/`mergeProxyResponse` (0.9.14–0.9.15), `t.rich` ReactNode types, Href query/hash. |

File an issue with label `adopter` or a PR updating this table.

## Freeze checklist

1. [x] `0.9.x` live on npm (through `0.9.7`; `0.9.8` ships adopter fixes)
2. [x] Freeze start: **2026-10-17** (first documented installable `0.9.x` on npm)
3. [ ] Three external production-like apps listed above *(1/3 — Noticed Sites)*
4. [ ] No breaking public-API changes for 4 weeks from freeze start

---
[Releasing](releasing.md) · [API freeze](api-freeze.md) · [Roadmap](../ROADMAP.md)
