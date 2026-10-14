# 0003. ICU MessageFormat as the only message syntax

- Status: Accepted
- Date: 2026-10-14

## Context
ICU MessageFormat 1 is the de-facto standard (next-intl, FormatJS, Lingui, TMS tools). MessageFormat 2 is maturing but tooling and translator familiarity are limited.

## Decision
Support ICU MF1 only for v1, with nested JSON files. The parser is next-tongue's own ([ADR 0010](0010-own-icu-parser.md)); keep it behind an internal AST so MF2 can be added later.

## Consequences
- \+ next-intl message files are reusable unchanged; TMS interoperability.
- − No MF2 features in v1. Revisit after v1.0 (roadmap "v1.x").
