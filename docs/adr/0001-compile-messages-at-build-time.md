# 0001. Compile messages at build time

- Status: Accepted
- Date: 2026-10-14

## Context
Runtime i18n libraries ship a message parser/formatter and JSON catalogs; to limit client size users must manually pick which messages to pass to a provider. Paraglide showed compiled message functions tree-shake well.

## Decision
Parse ICU at build time and emit one ES module per `(locale, namespace)` with one pure function per key. Client call sites are rewritten to import from these modules. No parser and no JSON catalog ship to the browser.

## Consequences
- \+ Client bundles contain only used messages for the active locale; syntax errors fail the build.
- \+ Types are derived from the same AST.
- − Requires a bundler integration (Turbopack + webpack) that must track Next.js releases.
- − Messages must exist at build time (no runtime CMS catalogs in v1).
- − Dynamic keys need an explicit escape hatch (`t.dynamic`).

## Alternatives considered
Runtime catalogs with a selective provider (next-intl model); precompiled JSON ASTs with a tiny runtime (FormatJS precompile) — smaller win, still ships catalogs.
