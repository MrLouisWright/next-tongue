# Roadmap

> **Status: beta 0.9** (API freeze; `0.9.x` on npm; freeze timer started **2026-10-17**). Dates are not promised. Each milestone ships when its acceptance criteria are met. Tracked in [GitHub milestones](https://github.com/MrLouisWright/next-tongue/milestones) and issues.

> **Scope freeze (2026-10-14):** no new features are added to any milestone before v0.1 ships. New ideas go to issues labelled for triage after v0.1.

**Constraint for every milestone:** zero dependencies beyond the `next` and `react` peers, enforced in CI ([ADR 0012](docs/adr/0012-zero-dependencies.md), [#28](https://github.com/MrLouisWright/next-tongue/issues/28)).

## v0.1 — Prove the differentiator
Goal: a usable alpha that shows a Turbopack-compatible compiler with message-level client tree-shaking on Next 16, measured against the best configs of the alternatives.
- `defineConfig` + config loader with validation (BCP 47 locales, `defaultLocale ∈ locales`, `{locale}` in `messages`).
- Own ICU MessageFormat parser and compiler with a documented subset ([ADR 0010](docs/adr/0010-own-icu-parser.md), [#3](https://github.com/MrLouisWright/next-tongue/issues/3), [#27](https://github.com/MrLouisWright/next-tongue/issues/27)).
- Codegen (`tongue build` and `withTongue` at `next.config` load): per-key exports, lazy formatters, fallback chains resolved ([ADR 0001](docs/adr/0001-compile-messages-at-build-time.md)).
- CLDR plural-category validation per locale (built-in `Intl.PluralRules`).
- Type generator: per-namespace `TongueRegister` interfaces ([ADR 0004](docs/adr/0004-generated-types-registry.md)).
- `getT`, `TongueProvider`/`useT`, core `T` runtime (`t`, `t.rich`, `t.has`, declared `t.dynamic`/`t.ns`) and `Format`.
- Per-file call-site loader for Turbopack and webpack ([ADR 0009](docs/adr/0009-client-message-delivery.md)).
- `examples/cache-components`.
- Published bundle benchmark vs next-intl (with `precompile`) and Paraglide ([#25](https://github.com/MrLouisWright/next-tongue/issues/25)).
- Repo tooling: pnpm workspace, TS, Vitest, lint, CI, changesets, dependency budget check, nightly `next@canary` run ([ADR 0011](docs/adr/0011-supported-next-versions.md), [#29](https://github.com/MrLouisWright/next-tongue/issues/29)).

**Acceptance criteria**
- [x] The parser passes the vendored ICU conformance corpus (test fixtures only) covering every construct in the supported subset in [ICU messages](docs/icu-messages.md); unsupported constructs fail the build ([#27](https://github.com/MrLouisWright/next-tongue/issues/27)).
- [x] Invalid ICU reports `file:key:line:col`.
- [x] Compiling a fixture with 3 locales produces modules where unused keys are removed by esbuild/Rollup tree-shaking (asserted in tests).
- [x] `tsd`/`expect-type` tests cover every row of the "What is checked" table in [Type safety](docs/type-safety.md) (`src/types/type-safety.test-d.ts`).
- [x] With a 10k-key registry, cold `tsc --noEmit` Check ≤ 2s (relative +15% when baseline ≥ 100ms); see `benchmarks/results/tsc-budget.json` ([#6](https://github.com/MrLouisWright/next-tongue/issues/6)).
- [x] A client component using 2 of 500 keys ships only those 2 (all locales below the threshold) with no extra round trip before interactivity (benchmarks + loader; no catalog waterfall).
- [x] The loader uses no `emitFile`/`loadModule`/`importModule` and works with `next dev`/`next build` (Turbopack) and `--webpack` ([#8](https://github.com/MrLouisWright/next-tongue/issues/8)).
- [x] `examples/cache-components` builds; all localized routes are reported as prerendered (static or PPR) by `next build` ([#15](https://github.com/MrLouisWright/next-tongue/issues/15)).
- [x] No catalog JSON appears in the RSC payload or HTML of any example route ([#20](https://github.com/MrLouisWright/next-tongue/issues/20), [research A4](docs/research.md)).
- [x] Default fallback follows CLDR parent locales and never crosses scripts (`zh-Hant-HK → zh-Hant`, never `zh-Hans`); explicit `fallback` overrides ([research A7](docs/research.md)).
- [x] Generated date formatters always pass the configured `timeZone` (default `'UTC'`) ([ADR 0008](docs/adr/0008-explicit-time-zone.md)).
- [x] Dev watcher: memory stays flat (< 10% growth) over 1,000 message edits (CI soak; full 30-min via `SOAK_MS=1800000`); one watcher across workers; no child process ([#23](https://github.com/MrLouisWright/next-tongue/issues/23)).
- [x] Early check: `cacheComponents: true` + `output: 'export'` — fails on Next 16.4.2 (PPR); documented in `examples/cache-export-probe/RESULT.md` ([#15](https://github.com/MrLouisWright/next-tongue/issues/15)).
- [x] Published package.json has no dependencies beyond `next`/`react` peers (CI) ([#28](https://github.com/MrLouisWright/next-tongue/issues/28)).
- [x] Benchmark published with reproducible scripts ([#25](https://github.com/MrLouisWright/next-tongue/issues/25)) — **no clear message-byte win vs Paraglide**; see provisional table above.
- [x] CI green on Node 20 and 22.

**Go/no-go gate:** if the benchmark does not show a clear client-bundle win over next-intl (precompile + `pick`) and Paraglide, stop and reconsider before building v0.2+ (options: change the delivery strategy, contribute upstream, or offer Paraglide-compatible output).

**Provisional go/no-go (2026-10-17, [#25](https://github.com/MrLouisWright/next-tongue/issues/25)):** on the 2-of-500 × 3-locale fixture (esbuild minify + gzip):

| Contender | gz | Notes |
|---|---:|---|
| Paraglide-style proxy | 171 | hand-rolled per-message |
| **next-tongue** | **213** | real codegen, messages only |
| next-intl pick proxy | 226 | narrowed JSON catalog |
| Paraglide messages-only | 249 | real compile, runtime stubbed |
| Lingui + `@lingui/core` | 2345 | narrowed catalog + runtime |
| Paraglide + runtime | 4043 | default client import |

**Verdict (message bytes): no clear win** over Paraglide. We beat Lingui’s runtime-inclusive best case and edge out next-intl’s pick proxy, but lose to Paraglide-style emit. Hydration/build RSS still open; until then treat the differentiator as **Turbopack-native loader + typed ICU + Cache Components**, not raw client bytes. Gate options if that holds: Paraglide-compatible output, per-locale splitting, or explicit repositioning before v0.2.

## v0.2 — Proxy, navigation, server formatting
- `createProxy` for `proxy.ts`: `prefix: 'always' | 'as-needed'`, detection, cookie, `/en/*` canonical redirect ([#30](https://github.com/MrLouisWright/next-tongue/issues/30)).
- `next-tongue/navigation`: `Link`, `redirect`, `permanentRedirect`, `useRouter`, `usePathname`, `getPathname` (thin wrappers over `next/link` and `next/navigation`).
- `generateAlternates`, `getDir`, `getOgLocale`; time zone per request ([#17](https://github.com/MrLouisWright/next-tongue/issues/17)).
- Server actions locale passing ([#26](https://github.com/MrLouisWright/next-tongue/issues/26)); `next-tongue/testing`.
- `examples/basic`, `examples/static-export` (`prefix: 'always'` only).
- Request-time `formatMessage(locale, icu, values)` for database/CMS strings [#34](https://github.com/MrLouisWright/next-tongue/issues/34) ([ADR 0013](docs/adr/0013-database-and-cms-messages.md)).
- Typed `Format` helpers: list, relative time, units, display names via `Intl` [#45](https://github.com/MrLouisWright/next-tongue/issues/45).
- Security hardening: XSS corpus, locale validation, threat model in [SECURITY.md](SECURITY.md) [#46](https://github.com/MrLouisWright/next-tongue/issues/46).
- Docs recipe: [per-user preferred language](docs/user-preferences.md) (helper ships in v1.1).
- Pseudo-localisation: `en-XA` [#36](https://github.com/MrLouisWright/next-tongue/issues/36).

**Acceptance criteria**
- [x] No next-tongue code path calls `headers()`, `cookies()` or `draftMode()` (lint rule + test).
- [x] `examples/static-export` builds with `output: 'export'`, `prefix: 'always'` and `dynamicParams = false`.
- [x] Playwright e2e for `as-needed` detection, locale cookie, and `/en` → `/` canonical redirect (`examples/basic` + `e2e/basic.spec.ts`). *(static-export covers `always`)*
- [x] `generateAlternates` output validated against Google hreflang rules (reciprocal, `x-default`).
- [x] Client runtime ≤ 2 kB min+gz enforced by `size-limit`.
- [x] `createProxy` locale resolution: p50 < 1 ms and p99 < 3 ms with 150 locales (benchmark in CI); no `Intl.*` construction per request; LRU on the header string ([research A3](docs/research.md)).
- [x] Locale cookie is `SameSite=Lax` by default (unit + e2e Set-Cookie). *(full cross-site navigation Playwright still nice-to-have)*
- [x] Hydration test: a date formatted in the static shell and a client component shows no hydration warning when the server `TZ` differs from the browser ([ADR 0008](docs/adr/0008-explicit-time-zone.md)) — Playwright with `timezoneId: America/New_York` vs config `UTC`.
- [x] `getT` works in `generateMetadata` and a server action on a freshly started worker ([research A8](docs/research.md)) — metadata titles + contact action e2e after `next start`.
- [x] `formatMessage` uses the own parser with a bounded LRU, works inside `'use cache'`, and passes an XSS corpus for rich-text tags [#34](https://github.com/MrLouisWright/next-tongue/issues/34).
- [x] `Format.list`, `relativeTime` (explicit `now`), `unit` and `displayName` are typed and tested in en, de, ar, ja [#45](https://github.com/MrLouisWright/next-tongue/issues/45).
- [x] XSS corpus passes for `t.rich` and `formatMessage`; locale inputs reject path traversal and CRLF/header injection; threat model published [#46](https://github.com/MrLouisWright/next-tongue/issues/46).
- [x] `en-XA` preserves ICU structure, expands and accents text, and is excluded from production by default [#36](https://github.com/MrLouisWright/next-tongue/issues/36).

## v0.3 — CLI check & extract, DX
- Dev overlay [#35](https://github.com/MrLouisWright/next-tongue/issues/35); translated validation errors (`translateIssues`) [#38](https://github.com/MrLouisWright/next-tongue/issues/38); accessible headless `LocaleSwitcher` [#44](https://github.com/MrLouisWright/next-tongue/issues/44); translated OG images and emails [#39](https://github.com/MrLouisWright/next-tongue/issues/39).

The CLI uses only Node built-ins (`util.parseArgs`, `readline`, `fs`, global `fetch`).

**Acceptance criteria**
- [x] `tongue check` implements all six checks in [CLI](docs/cli.md) with `pretty|json|github` reporters and documented exit codes, reusing the codegen AST.
- [x] `tongue check` on a 10k-key, 500-file repo completes in < 5 s.
- [x] `tongue extract` finds keys in `.ts/.tsx/.js/.jsx/.mdx`, adds missing source keys, `--prune` removes unused.
- [x] Dev overlay shows locale, missing keys and client-sent messages with click-to-key; no overlay code or key ids in production builds [#35](https://github.com/MrLouisWright/next-tongue/issues/35).
- [x] `translateIssues` translates Standard Schema-shaped issues with typed keys and no validator dependency [#38](https://github.com/MrLouisWright/next-tongue/issues/38).
- [x] `getT` works in `opengraph-image.tsx` (incl. RTL) and in an email rendering example [#39](https://github.com/MrLouisWright/next-tongue/issues/39).
- [x] `LocaleSwitcher` keeps the page, persists the choice, works without JS (plain links + a11y attrs in Playwright) [#44](https://github.com/MrLouisWright/next-tongue/issues/44).
- [x] Docs `ts`/`tsx typecheck` fences are extracted and type-checked in CI (`pnpm check:docs`) [#16](https://github.com/MrLouisWright/next-tongue/issues/16).
- [x] `tongue init` on `create-next-app@16` output yields a building app (`--yes`), writes `generateStaticParams = localeParams`, idempotent on second run.

## v0.4 — Localized pathnames, domains, monorepo, translator tooling
- Build-time database/CMS `sources` in `tongue.config.ts` [#33](https://github.com/MrLouisWright/next-tongue/issues/33); `tongue export`/`import` (XLIFF 2.0, CSV) [#37](https://github.com/MrLouisWright/next-tongue/issues/37); a11y/bidi checks in `tongue check` [#40](https://github.com/MrLouisWright/next-tongue/issues/40); stale-translation detection [#42](https://github.com/MrLouisWright/next-tongue/issues/42); translator context (`$meta`) [#43](https://github.com/MrLouisWright/next-tongue/issues/43); `tongue report` [#41](https://github.com/MrLouisWright/next-tongue/issues/41).

**Acceptance criteria**
- [x] `routing.pathnames`, `routing.domains` and `prefix: 'never'` with Playwright e2e ([#32](https://github.com/MrLouisWright/next-tongue/issues/32)).
- [x] A pnpm-workspace fixture (shared messages package + 2 apps, `declaration: true`) builds and type-checks with no TS2742 ([#21](https://github.com/MrLouisWright/next-tongue/issues/21), [research A6](docs/research.md)).
- [x] `sources` are awaited by `tongue build`, merged after files, compiled and typed; failures fail the build unless `sourcesOnError: 'use-cache'` [#33](https://github.com/MrLouisWright/next-tongue/issues/33).
- [x] XLIFF 2.0 / CSV export → import round-trip is lossless; invalid imports are rejected with `file:line` [#37](https://github.com/MrLouisWright/next-tongue/issues/37).
- [x] `tongue check` reports missing `lang`/`dir` and bidi issues on ar/he/fa fixtures [#40](https://github.com/MrLouisWright/next-tongue/issues/40).
- [x] `tongue check` flags targets whose source hash in `tongue.lock` changed [#42](https://github.com/MrLouisWright/next-tongue/issues/42).
- [x] `$meta` description, screenshot and `maxLength` reach `translate` and `export`; `tongue check` reports over-length targets [#43](https://github.com/MrLouisWright/next-tongue/issues/43). *(translate prompt wiring follows with #48)*
- [x] `tongue report` prints keys and bytes sent to the client per route, with a `--max-bytes` budget [#41](https://github.com/MrLouisWright/next-tongue/issues/41).

## v0.5 — AI translation
**Acceptance criteria**
- [x] Works against OpenAI and a local Ollama endpoint in CI (recorded fixtures for OpenAI), via global `fetch` only. *(mockable `fetchImpl` + OpenAI-compatible Chat Completions; Ollama via `baseURL`)*
- [x] Glossary enforcement and lockfile semantics exactly as in [AI translation](docs/ai-translation.md).
- [x] Placeholders and tags are masked before sending and restored after; max-cost/token budget; `--review` is the default in CI.
- [x] 100% of written outputs pass ICU parse + arg/tag/plural parity; invalid outputs never written.
- [x] `--dry-run` makes zero network calls (test).
- [x] API key never appears in logs, lockfile or error output (test).

## v0.9 — Beta (API freeze)
- [x] API freeze documented ([docs/api-freeze.md](docs/api-freeze.md)).
- [x] Docs site (`docs/index.html`) updated for pre-alpha + freeze status.
- [x] Security review of CLI recorded in [SECURITY.md](SECURITY.md) (`resolveInsideProject` on write paths).
- [x] Benchmarks re-run and published under `benchmarks/results/` (see summary.json).

**Acceptance criteria**
- [x] Decision recorded on an opt-in `getT(ns)` via `next/root-params` ([ADR 0007](docs/adr/0007-root-params-not-default.md), [#24](https://github.com/MrLouisWright/next-tongue/issues/24)): `routing.rootParams: true` + unit tests. Two-root-layout typing still blocked on [vercel/next.js#96756](https://github.com/vercel/next.js/issues/96756); stale-cache fix requires Next ≥ 16.3.8 ([#98493](https://github.com/vercel/next.js/issues/98493)).
- [ ] No breaking changes for 4 weeks; 3+ external production-like apps report success. *(freeze start 2026-10-17; 2/3 external — Noticed Sites, Hallume; see [docs/adopters.md](docs/adopters.md))*
- [x] All docs pages verified against real code (doc examples are type-checked in CI via `pnpm check:docs` / #16).

## v1.0 — Stable
**Acceptance criteria**
- [x] Semver guarantees documented; deprecation policy; support policy per [ADR 0011](docs/adr/0011-supported-next-versions.md) — see [docs/versioning.md](docs/versioning.md).
- [x] Zero open `priority: critical` bugs. *(none open as of 2026-10-17)*

## v1.1 — Editor & user preferences
- [x] VS Code extension in `packages/vscode` (VS Code API only): inline previews, missing-key diagnostics, go-to-message, hover with all locales [#47](https://github.com/MrLouisWright/next-tongue/issues/47). *(Marketplace / Open VSX publish pending.)*
- [x] Per-user preferred language: `setLocalePreference` action helper, signed cookie, `createProxy({ resolveLocale })` [#48](https://github.com/MrLouisWright/next-tongue/issues/48). No DB call in the proxy; no headers in cached scopes.

**Acceptance criteria**
- [ ] Extension published (Marketplace + Open VSX) with no runtime dependency beyond the VS Code API.
- [x] Preference recipe e2e: save → signed cookie → proxy resolves locale; tampered cookie ignored.

## Post-1.0 — Codemods
- [x] `tongue migrate next-intl` ([#31](https://github.com/MrLouisWright/next-tongue/issues/31)): client mapping + locale-in-scope threading + `TODO(tongue)` + `--out` JSON report. Early OSS dry-runs published under [docs/migrate-oss-results](docs/migrate-oss-results/README.md); full building-app AC remains after 1.0.
- The next-international codemod is **dropped** (no upstream release since Oct 2024).

## v1.x and beyond (ideas, not commitments)
MessageFormat 2; MDX/content localization; Vite/React Router adapter on the same compiler; VS Code extension (inline previews, go-to-message); TMS sync (XLIFF/PO export); opt-in per-locale client splitting once measured ([ADR 0009](docs/adr/0009-client-message-delivery.md)).
