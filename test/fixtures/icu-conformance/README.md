# ICU conformance corpus

Vendored fixtures for the own ICU parser ([ADR 0010](../../../docs/adr/0010-own-icu-parser.md), [#27](https://github.com/MrLouisWright/next-tongue/issues/27)).

| File | Purpose |
|---|---|
| `basic.json` | Smoke cases |
| `subset.json` | Every construct in the documented subset + unsupported errors |
| `format.json` | Parse → codegen → format roundtrips |

Fixtures only — never a package dependency.
