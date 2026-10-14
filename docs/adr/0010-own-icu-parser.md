# 0010. Own small ICU MessageFormat parser and compiler, with a documented subset

- Status: Accepted
- Date: 2026-10-14

## Context
The [critical review](../review.md) (M7) recommended reusing `@formatjs/icu-messageformat-parser`. That conflicts with [ADR 0012](0012-zero-dependencies.md): next-tongue has **zero dependencies** beyond the `next` and `react` peers, at runtime, build time and in the CLI. The parser only runs at build time and covers a bounded grammar, so a small purpose-built parser is affordable if it is held to a conformance corpus.

## Decision
- next-tongue ships its own ICU MessageFormat 1 parser and codegen (no third-party parser). It produces an internal AST with source locations and reports errors as `file:key:line:col`.
- **Supported subset** (documented in [ICU messages](../icu-messages.md)):
  - simple arguments `{name}`;
  - `plural` with `offset:N`, exact matches `=N` and `#`;
  - `select` and `selectordinal`;
  - `number`, `date` and `time` with Intl styles (`short`/`medium`/`long`/`full`, `integer`/`percent`/`currency`), named presets from config, and a **limited skeleton subset** (`::percent`, `::currency/XXX`, `::compact-short`, `::.00`-style fraction digits, `::unit/...`, and date skeletons mapped to `Intl.DateTimeFormat` fields);
  - escaping with apostrophes (`'{'`, `''`, quoted literal runs);
  - rich-text tags `<b>…</b>` and self-closing `<br/>` for `t.rich`.
- Anything outside the subset (unsupported skeleton tokens, `choice` format, etc.) **fails the build** with a clear error. It never degrades silently.
- **Conformance:** a corpus of ICU test messages (expected AST or formatted output per locale), drawn from public ICU/FormatJS test suites with their licences retained, is **vendored under `test/fixtures/icu-conformance/` as test fixtures only**. It is never a package dependency. CI runs it on every PR.
- Generated Intl formatters are created **lazily** on first call, not as module-level instances. `t.rich` generates stable React keys per tag index. Validation (CLDR plural categories, cross-locale arg/tag parity) uses the built-in `Intl.PluralRules`.

## Consequences
- \+ No dependency; full control over error messages and AST locations.
- \+ The grammar subset is explicit and tested, not "whatever the dependency accepts".
- − Parser work moves into v0.1 scope and adds maintenance ([#3](https://github.com/MrLouisWright/next-tongue/issues/3), [#27](https://github.com/MrLouisWright/next-tongue/issues/27)).
- − Parity bugs are possible; mitigated by the conformance corpus.

## Alternatives considered
- Reuse `@formatjs/icu-messageformat-parser` (review M7): rejected because of [ADR 0012](0012-zero-dependencies.md).
- Bundle a copy of FormatJS inside the package: a dependency in disguise, and harder to maintain.
