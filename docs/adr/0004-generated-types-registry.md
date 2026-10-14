# 0004. Types via generated module augmentation

- Status: Accepted
- Date: 2026-10-14

## Context
Typed keys can come from `typeof import('./en.json')` (no ICU arg types; slow for large files) or from generated declarations.

## Decision
The compiler writes `.tongue/types.d.ts` augmenting `interface TongueRegister` in module `next-tongue` with locales, flattened key→args map, and pathnames. Library generics read from the registry.

## Consequences
- \+ ICU arg types; flat map keeps TS fast on 10k+ keys.
- − Types are stale until regeneration; mitigated by dev watcher and `tongue extract --types-only` in CI.
