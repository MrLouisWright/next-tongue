# 0004. Types via generated module augmentation

- Status: Accepted
- Date: 2026-10-14 (amended 2026-10-14: per-namespace interfaces, tsc budget)

## Context
Typed keys can come from `typeof import('./en.json')` (no ICU arg types; slow for large files) or from generated declarations.

## Decision
The compiler writes `.tongue/types.d.ts` augmenting `interface TongueRegister` in module `next-tongue` with locales, pathnames and **per-namespace interfaces** (`TongueRegister['ns']['home']['inbox']` → args). `useT('home')`/`getT(locale, 'home')` index into the namespace instead of filtering a global key union; library types avoid conditional or template-literal types over the full key union.

Codegen runs from `tongue build`, at `next.config` load and in the dev watcher, so CI can generate types before `tsc` with no `postinstall`. Missing types are a clear error, never a silent `any`.

**Budget** (measured with `tsc --extendedDiagnostics` and `--generateTrace`): with a 10k-key registry, cold `tsc --noEmit` is ≤ 15% slower than the same app without i18n; an incremental check of a file with 50 `t()` calls is measured and published; tsserver completion latency in a 10k-key project is measured and tracked.

## Consequences
- \+ ICU arg types; per-namespace indexing keeps TS fast on 10k+ keys.
- − Types are stale until regeneration; mitigated by dev watcher and `tongue build` in CI.
