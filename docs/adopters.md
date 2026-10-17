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

1. [ ] Staged `0.9.0` (or `0.9.1` with the root-params fix) approved on npm
2. [ ] Freeze start date recorded in ROADMAP / CHANGELOG
3. [ ] Three external production-like apps listed above
4. [ ] No breaking public-API changes for 4 weeks

---
[Releasing](releasing.md) · [API freeze](api-freeze.md) · [Roadmap](../ROADMAP.md)
