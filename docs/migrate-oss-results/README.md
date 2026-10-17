# `tongue migrate next-intl` — OSS dry-run results

Early measurement for [#31](https://github.com/MrLouisWright/next-tongue/issues/31) (full building-app AC remains post-1.0). Ran against three public next-intl App Router apps (not the official `amannn/next-intl` example).

```bash
node packages/next-tongue/bin/tongue.js migrate next-intl --cwd <app> --dry-run --out tongue-migrate-report.json
```

| App | Commit | Changed files | Notes | `TODO(tongue)` |
|---|---|---:|---:|---:|
| [yeasin2002/bulletproof-nextjs-starter](https://github.com/yeasin2002/bulletproof-nextjs-starter) | `d971435` | 6 | 9 | **1** |
| [boilerthing/boilerthing](https://github.com/boilerthing/boilerthing) | `4c20491` | 35 | 72 | **13** |
| [ixartz/Next-js-Boilerplate](https://github.com/ixartz/Next-js-Boilerplate) | `b83157a` | 24 | 58 | **11** |

Raw reports: `bulletproof-nextjs-starter.json`, `boilerthing.json`, `Next-js-Boilerplate.json` (same directory).

### What the TODOs mean

Bare `getTranslations('ns')` / `getTranslations()` without `locale` in scope become `TODO(tongue)` — next-tongue requires an explicit locale (or `routing.rootParams`). Client `useTranslations` → `useT` and explicit `{ locale, namespace }` → `getT(locale, ns)` rewrite without TODOs.

### Also sampled (not in the table)

| App | TODOs | Notes |
|---|---:|---|
| MohOulabi/nextjs-shadcn-admin | 2 | 53 notes / 22 files |
| daquino94/linux-path | 2 | 22 notes / 11 files |
| LeonZeng919/next-shadcn-intl-template | 0 | 8 notes / 4 files |
| revokslab/ShipFree | 0 | Documents next-intl only; no source call sites |

Date: 2026-10-17 · CLI from `main` at measurement time.
