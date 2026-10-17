> 📄 Mirrors [`docs/cli.md`](https://github.com/MrLouisWright/next-tongue/blob/main/docs/cli.md) in the main repo — the repo version is canonical.

# CLI

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](Roadmap).

Binary: `tongue` (via `npx tongue` or a package.json script). Every command reads `tongue.config.ts`, supports `--config <path>`, `--cwd <dir>`, `--json` (machine-readable output) and `--quiet`. Exit codes: `0` ok, `1` check failures, `2` usage/config error.

## `tongue build`
Runs codegen: compiles messages (files + build-time `sources`) into `.tongue/` and writes types. The same step `withTongue` runs at `next.config` load; use it in CI before `tsc`/tests. Flags: `--watch`, `--watch-sources <seconds>`.

The CLI uses only Node built-ins (`util.parseArgs`, `readline`, `fs`, global `fetch`) ([ADR 0012](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0012-zero-dependencies.md)).

## `tongue init`
Scaffolds config, messages, `proxy.ts`, `[locale]` layout and `withTongue` (see [Getting started](Getting-Started)).
Writes `export const generateStaticParams = localeParams` in the root `[locale]` layout.
Flags: `--locales en,de`, `--default en`, `--prefix always|as-needed|never`, `--export` (static-export setup, `prefix: 'always'`), `--yes` (non-interactive), `--dry-run`.
Refuses to overwrite existing files unless `--force`; prints a diff in `--dry-run`.

## `tongue extract`
Scans source (`app/`, `src/`, `components/` by default; `--include` glob) for `t()`, `t.rich()`, `useT()` and `getT()` calls and:
- adds keys found in code but missing from the **default-locale** file (value = key, or `--placeholder ''`),
- reports keys in files but unused in code (`--prune` removes them, after confirmation),
- regenerates `.tongue/types.d.ts` (same as `tongue build`).

## `tongue check`
CI gate. Reads messages + source, reports:

| Check | Meaning | Severity from |
|---|---|---|
| `missing` | Key in default locale but absent in another locale | `strict.missing` |
| `unused` | Key in messages, never referenced in code | `strict.unused` |
| `undefined` | Key referenced in code, absent in default locale | always `error` |
| `mismatch` | ICU args, tags or plural categories differ from default locale | `strict.mismatch` |
| `syntax` | ICU parse error | always `error` |
| `stale` | Source text changed since the target was translated (source hashes in `tongue.lock`) | `strict.stale` (default `warn`) |
| `length` (v0.4) | Target longer than `$meta.maxLength` | `strict.length` (default `warn`) |
| `a11y` (v0.4) | Root layout `<html>` missing `lang={locale}` or `dir={getDir(locale)}`; RTL locales without `dir` | `strict.a11y` (default `error`) |
| `bidi` (v0.4) | RTL messages with unbalanced bidi controls, LTR-only punctuation around args, or args that need isolation (`\u2068…\u2069`) | `strict.bidi` (default `warn`) |

Flags: `--locale de`, `--reporter pretty|json|github` (`github` emits workflow annotations), `--max-warnings 0`.

```yaml
# .github/workflows/i18n.yml
- run: npx tongue check --reporter github
```

## `tongue translate`
Fills missing/stale target messages using an LLM. See [AI translation](AI-Translation).
Flags: `--locale de,fr`, `--keys 'home.*'`, `--dry-run`, `--yes`, `--concurrency 4`, `--retranslate` (ignore lock), `--review` (write to `messages/{locale}.review.json` instead of in place; default when `CI=true`), `--accept` (merge reviewed `*.review.json` files into messages and update the lock), `--max-cost N` (estimated-token budget).

## `tongue export` / `tongue import` (v0.4)
XLIFF 2.0 and CSV round-trip for translators. See [Translator workflow](Translator-Workflow).

## `tongue report` (v0.4)
Per-route keys and bytes sent to the client, from `next build` output. See [Dev tools](Dev-Tools).

## `tongue migrate next-intl`
Codemod ([#31](https://github.com/MrLouisWright/next-tongue/issues/31)): client `useTranslations` → `useT`, threads `getT(locale, ns)` when `locale` is in scope, otherwise `TODO(tongue)`. Flags: `--dry-run`, `--json`, `--out report.json`. See [Migration from next-intl](Migration-from-next-intl). The next-international codemod is dropped.
