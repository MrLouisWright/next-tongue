# CLI

> **Status: 1.0.** `tongue build`, `check`, `extract`, `init`, `export`/`import`, `report`, and `translate` are implemented. See [ROADMAP](../ROADMAP.md).

Binary: `tongue` (via `npx tongue` or a package.json script). Every command reads `tongue.config.ts`, supports `--config <path>`, `--cwd <dir>`, `--json` (machine-readable output) and `--quiet`. Exit codes: `0` ok, `1` check failures, `2` usage/config error.

## `tongue build`
Runs codegen: compiles messages (files + build-time `sources`) into `.tongue/` and writes types. The same step `withTongue` runs at `next.config` load; use it in CI before `tsc`/tests. Flags: `--watch`, `--watch-sources <seconds>`.

The CLI uses only Node built-ins (`util.parseArgs`, `readline`, `fs`, global `fetch`) ([ADR 0012](adr/0012-zero-dependencies.md)).

## `tongue init`
Scaffolds config, messages, `proxy.ts`, `[locale]` layout and `withTongue` (see [Getting started](getting-started.md)).
Writes `export const generateStaticParams = localeParams` in the root `[locale]` layout.
Flags: `--locales en,de`, `--default en`, `--prefix always|as-needed|never`, `--proxy merge|skip|overwrite` (existing proxy/middleware: merge wires `createProxy` + `mergeProxyResponse` wrap, skip leaves it, overwrite replaces with the scaffold; default `skip`), `--export` (static-export setup, `prefix: 'always'`), `--yes` (non-interactive), `--dry-run`, `--force` (overwrite existing scaffold files such as the sample `home` page / messages).
Refuses to overwrite existing files unless `--force` (or `--proxy overwrite` for the proxy file); prints a plan in `--dry-run`. After init, replace or delete the sample `home.*` keys so they are not left in production catalogs.

## `tongue extract`
Scans source (`app/`, `src/`, `components/`, `lib/`, `server/`, `actions/` by default; `--include` or `scan.include` in config) for `t()`, `t.rich()`, `useT()` and `getT()` calls and:
- adds keys found in code but missing from the **default-locale** file (value = key, or `--placeholder ''`),
- reports keys in files but unused in code (`--prune` removes them, after confirmation),
- regenerates `.tongue/types.d.ts` (same as `tongue build`).

## `tongue check`
CI gate. Reads messages + source, reports. Run it **before** `tongue build` after machine translation — it catches ICU arg parity (`missing=[] extra=[name]`), apostrophe traps in EN source, and undefined keys without waiting for a full Next build:

| Check | Meaning | Severity from |
|---|---|---|
| `missing` | Key in default locale but absent in another locale | `strict.missing` |
| `unused` | Key in messages, never referenced in code | `strict.unused` — skipped for `$meta.planned` / `@tongue-ignore` / `unusedIgnore` |
| `undefined` | Key referenced in code, absent in default locale | always `error` |
| `dynamic` | Client `useT` + `t(variable)` without a string literal | always `error` — use `t.dynamic(key, { from })` |
| `icu` | Likely unescaped prose apostrophe (`l'été` → write `l''été`) | `warn` for fr/it/… only (not English `don't`) |
| `client-loader` | `"use client"` + `useT` rewrite calls `useLocale` without importing it | always `error` (Safari ReferenceError) |
| `mismatch` | ICU args, tags or plural categories differ from default locale | `strict.mismatch` |
| `syntax` | ICU parse error | always `error` |
| `stale` | Source text changed since the target was translated (source hashes in `tongue.lock`) | `strict.stale` (default `warn`) |
| `length` (v0.4) | Target longer than `$meta.maxLength` | `strict.length` (default `warn`) |
| `a11y` | Root layout `<html>` missing `lang={locale}` or `dir={getDir(locale)}`; RTL locales without `dir` | `strict.a11y` (default `error`) |
| `bidi` | RTL messages with unbalanced bidi controls, LTR-only punctuation around args, or args that need isolation (`\u2068…\u2069`) | `strict.bidi` (default `warn`) |

Flags: `--locale de`, `--reporter pretty|json|github` (`github` emits workflow annotations), `--max-warnings 0`.

```yaml
# .github/workflows/i18n.yml
- run: npx tongue check --reporter github
```

## Loomlocale commands (1.0)
Binary aliases: `tongue` and `next-tongue`. Running `npx next-tongue` with no command in a terminal starts the guided wizard (non-TTY: prints help, exit 2).

| Command | What it does |
|---|---|
| `tongue init` | Interactive wizard (TTY). `--scaffold`, `--yes`, `--locales`… keep the classic Next.js scaffolder. |
| `tongue login [--no-browser]` | OAuth device code: prints the code + `loomlocale.com/device`, opens the browser, polls, stores the token (OS keychain, fallback `~/.config/loomlocale/credentials.json`). |
| `tongue logout` / `tongue whoami [--json]` | Forget the token / show account + plan. |
| `tongue link [--project <id\|name>] [--create <name>]` | Pick or create a project and write `cloud.projectId` into your config. |
| `tongue update` | Pull web edits + glossary, diff against `tongue.lock`, translate only new/changed keys, show a per-key diff, write, push. `--dry-run` (no network), `--ci` (non-interactive, uses `LOOMLOCALE_TOKEN`), `--yes`, `--prefer local\|remote`, `--locale`, `--keys`, `--max-chars N`, `--max-cost GBP`, `--concurrency N`, `--review pr`, `--out-dir DIR`, `--json`. |
| `tongue status [--json]` | Per-locale new/changed/removed counts (exit 1 when out of date). |
| `tongue push` / `tongue pull [--prefer …]` | Upload all strings / apply web edits only. |
| `tongue translate` | One-off translation without sync; `--review` writes `*.review.json`, `--accept` applies them (CI defaults to review). |

Global: `--base-url <url>` (or `LOOMLOCALE_API_URL`). See [AI translation](ai-translation.md) and the [API contract](api-contract.md).
`tongue translate` flags: `--locale de,fr`, `--keys 'home.*'`, `--dry-run`, `--yes`, `--concurrency N`, `--retranslate` (ignore lock), `--review` (write to `messages/{locale}.review.json` instead of in place; default when `CI=true`), `--accept` (merge reviewed `*.review.json` files into messages and update the lock), `--max-chars N`, `--max-cost GBP`.

### `tongue update` in detail

**Review before writing.** After translating, `update` prints every key that will change, grouped by locale:

```
de
  + home.title
      + Hallo, {name}!
  ~ home.body
      - Willkommen
      + Willkommen zurück
  - old.key
      - Alt
1 added, 1 changed, 1 removed
```

Colour is used only on a TTY and is disabled by `NO_COLOR`. In a terminal you are asked to confirm. `--yes` (or `--ci`) skips the prompt. With `--json` the diff is in the `changes` array of the JSON summary (`{ locale, key, kind: "added"|"changed"|"removed", before?, after? }`). If you decline, nothing is written and the exit code is 1. Finished translations are kept in `tongue.lock.run.json`, so the next run reuses them without billing again.

**Where changes go.**
- Default: dictionaries and `tongue.lock` are updated in place, then pushed to Loomlocale.
- `--out-dir .tongue-staging`: dictionaries and the lock are written under that directory (mirroring their paths). Your files are untouched and nothing is pushed.
- `--review pr`: creates a branch `tongue/update-<timestamp>`, commits only the changed dictionaries and `tongue.lock`, pushes to `origin`, opens a pull request, then switches back to your branch. Your working tree is not modified. The PR body is a Markdown table of the per-key changes. To open the PR, the CLI uses `GITHUB_TOKEN` (or `GH_TOKEN`) with `GITHUB_REPOSITORY` / the `origin` URL (and `GITHUB_API_URL` on GHES); otherwise it uses the `gh` CLI; if neither is available it pushes the branch and prints a message. Translations are not pushed to Loomlocale in this mode; run `tongue push` after merging.

**Spending caps.** Before translating, `update` asks Loomlocale for an estimate and aborts with **exit code 1** (`TONGUE_E_BUDGET`, nothing translated or billed) when a cap would be exceeded:

| Cap | Flag | Env (CI) | Config |
|---|---|---|---|
| chars per run | `--max-chars N` | `LOOMLOCALE_MAX_CHARS` | `cloud.budget.maxChars` (legacy `translate.maxChars`) |
| £ per run | `--max-cost 5` | `LOOMLOCALE_MAX_COST` | `cloud.budget.maxCostGBP` |
| chars per billing period | — | — | `cloud.budget.monthlyChars` |
| £ per billing period | — | — | `cloud.budget.monthlyCostGBP` |

Flags beat env, env beats config. An organisation spend cap set on loomlocale.com (`withinSpendCap: false` in the estimate) also aborts the run. `--dry-run` checks per-run caps against the local count (no network).

**Resilience.** `429`/`503` responses and dropped connections are retried, honouring `Retry-After`, with exponential backoff and jitter (`cloud.maxRetries`, default 5). Translate requests carry a deterministic `Idempotency-Key`. Job ids and progress are saved to `tongue.lock.run.json` (add it to `.gitignore`). If a run is interrupted (crash, Ctrl-C, network loss), re-running `tongue update` resumes polling the same jobs and reuses finished batches instead of translating again. The file is deleted when the run completes.

**Performance.** Keys are sent in batches (≤ `cloud.batchSize` keys, default 100, and ≤ `cloud.batchChars` source chars, default 20 000, per request). Target locales are translated concurrently: `--concurrency N` or `cloud.concurrency`, default 4. After a `429`, all workers pause until `Retry-After` expires.

## `tongue export` / `tongue import` (v0.4)
XLIFF 2.0 and CSV round-trip for translators. See [Translator workflow](translator-workflow.md).

## `tongue report` (v0.4)
Per-route keys and bytes sent to the client, from `next build` output. See [Dev tools](dev-tools.md).

## `tongue migrate next-intl`
Codemod ([#31](https://github.com/MrLouisWright/next-tongue/issues/31)): client `useTranslations` → `useT`, import rewrites, threads `getTranslations('ns')` → `getT(locale, 'ns')` when `locale` is in scope, otherwise `TODO(tongue)`. Flags: `--dry-run`, `--json`, `--out report.json`. See [Migration from next-intl](migration/next-intl.md). The next-international codemod is dropped.

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
