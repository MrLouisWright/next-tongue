# Adopters & production-like verification

Tracks the v0.9 freeze AC: *no breaking changes for 4 weeks; 3+ external production-like apps report success* (timer starts when `0.9.x` is live on npm, after staged approve).

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

## External (wanted)

After `next-tongue@0.9.x` is installable from npm, record success here:

| App / org | Contact | Version | Notes |
|---|---|---|---|
| *(open)* | | | |

File an issue with label `adopter` or a PR updating this table.

## Freeze checklist

1. [x] `0.9.1` live on npm (Turbopack root-params fix)
2. [ ] Approve staged **`0.9.2`** (README + LICENSE on the registry page)
3. [ ] Freeze start date recorded in ROADMAP / CHANGELOG *(starts when adopters can install a documented release — treat `0.9.1` as start if preferred)*
4. [ ] Three external production-like apps listed above
5. [ ] No breaking public-API changes for 4 weeks

---
[Releasing](releasing.md) · [API freeze](api-freeze.md) · [Roadmap](../ROADMAP.md)
