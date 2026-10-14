# CLI

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

Binary: `tongue` (via `npx tongue` or a package.json script). Every command reads `tongue.config.ts`, supports `--config <path>`, `--cwd <dir>`, `--json` (machine-readable output) and `--quiet`. Exit codes: `0` ok, `1` check failures, `2` usage/config error.

## `tongue init`
Scaffolds config, messages, `proxy.ts`, `[locale]` layout and `withTongue` (see [Getting started](getting-started.md)).
Flags: `--locales en,de`, `--default en`, `--prefix always|as-needed|never`, `--export` (static-export setup), `--yes` (non-interactive), `--dry-run`.
Refuses to overwrite existing files unless `--force`; prints a diff in `--dry-run`.

## `tongue extract`
Scans source (`app/`, `src/`, `components/` by default; `--include` glob) for `t()`, `t.rich()`, `useT()` and `getT()` calls and:
- adds keys found in code but missing from the **default-locale** file (value = key, or `--placeholder ''`),
- reports keys in files but unused in code (`--prune` removes them, after confirmation),
- regenerates `.tongue/types.d.ts` (`--types-only` does just this).

## `tongue check`
CI gate. Reads messages + source, reports:

| Check | Meaning | Severity from |
|---|---|---|
| `missing` | Key in default locale but absent in another locale | `strict.missing` |
| `unused` | Key in messages, never referenced in code | `strict.unused` |
| `undefined` | Key referenced in code, absent in default locale | always `error` |
| `mismatch` | ICU args, tags or plural categories differ from default locale | `strict.mismatch` |
| `syntax` | ICU parse error | always `error` |
| `stale` | Source text changed since the target was translated (via `tongue.lock`) | `warn` |

Flags: `--locale de`, `--reporter pretty|json|github` (`github` emits workflow annotations), `--max-warnings 0`.

```yaml
# .github/workflows/i18n.yml
- run: npx tongue check --reporter github
```

## `tongue translate`
Fills missing/stale target messages using an LLM. See [AI translation](ai-translation.md).
Flags: `--locale de,fr`, `--keys 'home.*'`, `--dry-run`, `--yes`, `--concurrency 4`, `--retranslate` (ignore lock), `--review` (write to `messages/{locale}.review.json` instead of in place), `--accept` (merge reviewed `*.review.json` files into messages and update the lock).

## `tongue migrate <from>`
Codemods: `tongue migrate next-intl` or `tongue migrate next-international`. See [Migration](migration/next-intl.md). Flags: `--dry-run` (default prints diff), `--write`, `--include <glob>`.

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
