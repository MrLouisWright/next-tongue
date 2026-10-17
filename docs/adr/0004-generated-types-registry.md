# 0004. Types via generated module augmentation

- Status: Accepted
- Date: 2026-10-14 (amended 2026-10-14: per-namespace interfaces, tsc budget)

## Context
Typed keys can come from `typeof import('./en.json')` (no ICU arg types; slow for large files) or from generated declarations.

## Decision
The compiler writes `.tongue/types.d.ts` augmenting `interface TongueRegister` in module `next-tongue` with locales, pathnames and **per-namespace interfaces** (`TongueRegister['ns']['home']['inbox']` → args). `useT('home')`/`getT(locale, 'home')` index into the namespace instead of filtering a global key union; library types avoid conditional or template-literal types over the full key union.

Codegen runs from `tongue build`, at `next.config` load and in the dev watcher, so CI can generate types before `tsc` with no `postinstall`. Missing types are a clear error, never a silent `any`.

**Budget** (measured with `tsc --extendedDiagnostics` via `benchmarks/tsc-budget`): with a 10k-key registry and a file of 50 typed `t()` calls, cold Check time is **≤ 2s**. When the no-i18n baseline Check time is ≥ 100ms, with-i18n is also ≤ **+15%**. Results land in `benchmarks/results/tsc-budget.json`. tsserver completion latency remains a follow-up measurement.

## Consequences
- \+ ICU arg types; per-namespace indexing keeps TS fast on 10k+ keys.
- − Types are stale until regeneration; mitigated by dev watcher and `tongue build` in CI.
