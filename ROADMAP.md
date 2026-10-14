# Roadmap

> **Status: pre-alpha.** Dates are not promised. Each milestone ships when its acceptance criteria are met. Tracked in [GitHub milestones](https://github.com/MrLouisWright/next-tongue/milestones) and issues. Reordered on 2026-10-14 after the [critical review](docs/review.md): the differentiator is proven first, behind a go/no-go gate.

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
- [ ] The parser passes the vendored ICU conformance corpus (test fixtures only) covering every construct in the supported subset in [ICU messages](docs/icu-messages.md); unsupported constructs fail the build ([#27](https://github.com/MrLouisWright/next-tongue/issues/27)).
- [ ] Invalid ICU reports `file:key:line:col`.
- [ ] Compiling a fixture with 3 locales produces modules where unused keys are removed by esbuild/Rollup tree-shaking (asserted in tests).
- [ ] `tsd`/`expect-type` tests cover every row of the "What is checked" table in [Type safety](docs/type-safety.md).
- [ ] With a 10k-key registry, cold `tsc --noEmit` is ≤ 15% slower than the same app without i18n; incremental and tsserver completion latency measured and published.
- [ ] A client component using 2 of 500 keys ships only those 2 (all locales below the threshold) with no extra round trip before interactivity.
- [ ] The loader uses no `emitFile`/`loadModule`/`importModule` and works with `next dev`/`next build` (Turbopack) and `--webpack`.
- [ ] `examples/cache-components` builds; all localized routes are reported as prerendered (static or PPR) by `next build`.
- [ ] No catalog JSON appears in the RSC payload or HTML of any example route ([#20](https://github.com/MrLouisWright/next-tongue/issues/20), [research A4](docs/research.md)).
- [ ] Default fallback follows CLDR parent locales and never crosses scripts (`zh-Hant-HK → zh-Hant`, never `zh-Hans`); explicit `fallback` overrides ([research A7](docs/research.md)).
- [ ] Generated date formatters always pass the configured `timeZone` (default `'UTC'`) ([ADR 0008](docs/adr/0008-explicit-time-zone.md)).
- [ ] Dev watcher: memory stays flat (< 10% growth) over a 30-minute soak with 1,000 message edits; one watcher across workers; no child process outlives `next dev` ([research A9](docs/research.md)).
- [ ] Early check: `cacheComponents: true` + `output: 'export'` builds on the current 16.x ([#15](https://github.com/MrLouisWright/next-tongue/issues/15)).
- [ ] Published package.json has no dependencies beyond `next`/`react` peers (CI) ([#28](https://github.com/MrLouisWright/next-tongue/issues/28)).
- [ ] Benchmark published with reproducible scripts ([#25](https://github.com/MrLouisWright/next-tongue/issues/25)).
- [ ] CI green on Node 20 and 22.

**Go/no-go gate:** if the benchmark does not show a clear client-bundle win over next-intl (precompile + `pick`) and Paraglide, stop and reconsider before building v0.2+ (options: change the delivery strategy, contribute upstream, or offer Paraglide-compatible output).

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
- [ ] No next-tongue code path calls `headers()`, `cookies()` or `draftMode()` (lint rule + test).
- [ ] `examples/static-export` builds with `output: 'export'`, `prefix: 'always'` and `dynamicParams = false`.
- [ ] Playwright e2e for `always` and `as-needed`, detection, cookie and the canonical redirect.
- [ ] `generateAlternates` output validated against Google hreflang rules (reciprocal, `x-default`).
- [ ] Client runtime ≤ 2 kB min+gz enforced by `size-limit`.
- [ ] `createProxy` locale resolution: p50 < 1 ms and p99 < 3 ms with 150 locales (benchmark in CI); no `Intl.*` construction per request; LRU on the header string ([research A3](docs/research.md)).
- [ ] Locale cookie is `SameSite=Lax` by default and is sent on a cross-site navigation in Playwright ([research A5](docs/research.md)).
- [ ] Hydration test: a date formatted in the static shell and a client component shows no hydration warning when the server `TZ` differs from the browser ([ADR 0008](docs/adr/0008-explicit-time-zone.md)).
- [ ] `getT` works in `generateMetadata` and a server action on a freshly started worker ([research A8](docs/research.md)).
- [ ] `formatMessage` uses the own parser with a bounded LRU, works inside `'use cache'`, and passes an XSS corpus for rich-text tags [#34](https://github.com/MrLouisWright/next-tongue/issues/34).
- [ ] `Format.list`, `relativeTime` (explicit `now`), `unit` and `displayName` are typed and tested in en, de, ar, ja [#45](https://github.com/MrLouisWright/next-tongue/issues/45).
- [ ] XSS corpus passes for `t.rich` and `formatMessage`; locale inputs reject path traversal and CRLF/header injection; threat model published [#46](https://github.com/MrLouisWright/next-tongue/issues/46).
- [ ] `en-XA` preserves ICU structure, expands and accents text, and is excluded from production by default [#36](https://github.com/MrLouisWright/next-tongue/issues/36).

## v0.3 — CLI check & extract, DX
- Dev overlay [#35](https://github.com/MrLouisWright/next-tongue/issues/35); translated validation errors (`translateIssues`) [#38](https://github.com/MrLouisWright/next-tongue/issues/38); accessible headless `LocaleSwitcher` [#44](https://github.com/MrLouisWright/next-tongue/issues/44); translated OG images and emails [#39](https://github.com/MrLouisWright/next-tongue/issues/39).

The CLI uses only Node built-ins (`util.parseArgs`, `readline`, `fs`, global `fetch`).

**Acceptance criteria**
- [ ] `tongue check` implements all six checks in [CLI](docs/cli.md) with `pretty|json|github` reporters and documented exit codes, reusing the codegen AST.
- [ ] `tongue check` on a 10k-key, 500-file repo completes in < 5 s.
- [ ] `tongue extract` finds keys in `.ts/.tsx/.js/.jsx/.mdx`, adds missing source keys, `--prune` removes unused.
- [ ] Dev overlay shows locale, missing keys and client-sent messages with click-to-key; no overlay code or key ids in production builds [#35](https://github.com/MrLouisWright/next-tongue/issues/35).
- [ ] `translateIssues` translates Standard Schema-shaped issues with typed keys and no validator dependency [#38](https://github.com/MrLouisWright/next-tongue/issues/38).
- [ ] `getT` works in `opengraph-image.tsx` (incl. RTL) and in an email rendering example; examples type-checked [#39](https://github.com/MrLouisWright/next-tongue/issues/39).
- [ ] `LocaleSwitcher` keeps the page, persists the choice, works without JS and passes axe in Playwright [#44](https://github.com/MrLouisWright/next-tongue/issues/44).
- [ ] `tongue init` on `create-next-app@16` output yields a building app (`--yes`), writes `generateStaticParams = localeParams`, idempotent on second run.

## v0.4 — Localized pathnames, domains, monorepo, translator tooling
- Build-time database/CMS `sources` in `tongue.config.ts` [#33](https://github.com/MrLouisWright/next-tongue/issues/33); `tongue export`/`import` (XLIFF 2.0, CSV) [#37](https://github.com/MrLouisWright/next-tongue/issues/37); a11y/bidi checks in `tongue check` [#40](https://github.com/MrLouisWright/next-tongue/issues/40); stale-translation detection [#42](https://github.com/MrLouisWright/next-tongue/issues/42); translator context (`$meta`) [#43](https://github.com/MrLouisWright/next-tongue/issues/43); `tongue report` [#41](https://github.com/MrLouisWright/next-tongue/issues/41).

**Acceptance criteria**
- [ ] `routing.pathnames`, `routing.domains` and `prefix: 'never'` with Playwright e2e ([#32](https://github.com/MrLouisWright/next-tongue/issues/32)).
- [ ] A pnpm-workspace fixture (shared messages package + 2 apps, `declaration: true`) builds and type-checks with no TS2742 ([#21](https://github.com/MrLouisWright/next-tongue/issues/21), [research A6](docs/research.md)).
- [ ] `sources` are awaited by `tongue build`, merged after files, compiled and typed; failures fail the build unless `sourcesOnError: 'use-cache'` [#33](https://github.com/MrLouisWright/next-tongue/issues/33).
- [ ] XLIFF 2.0 / CSV export → import round-trip is lossless; invalid imports are rejected with `file:line` [#37](https://github.com/MrLouisWright/next-tongue/issues/37).
- [ ] `tongue check` reports missing `lang`/`dir` and bidi issues on ar/he/fa fixtures [#40](https://github.com/MrLouisWright/next-tongue/issues/40).
- [ ] `tongue check` flags targets whose source hash in `tongue.lock` changed [#42](https://github.com/MrLouisWright/next-tongue/issues/42).
- [ ] `$meta` description, screenshot and `maxLength` reach `translate` and `export`; `tongue check` reports over-length targets [#43](https://github.com/MrLouisWright/next-tongue/issues/43).
- [ ] `tongue report` prints keys and bytes sent to the client per route, with a `--max-bytes` budget [#41](https://github.com/MrLouisWright/next-tongue/issues/41).

## v0.5 — AI translation
**Acceptance criteria**
- [ ] Works against OpenAI and a local Ollama endpoint in CI (recorded fixtures for OpenAI), via global `fetch` only.
- [ ] Glossary enforcement and lockfile semantics exactly as in [AI translation](docs/ai-translation.md).
- [ ] Placeholders and tags are masked before sending and restored after; max-cost/token budget; `--review` is the default in CI.
- [ ] 100% of written outputs pass ICU parse + arg/tag/plural parity; invalid outputs never written.
- [ ] `--dry-run` makes zero network calls (test).
- [ ] API key never appears in logs, lockfile or error output (test).

## v0.9 — Beta (API freeze)
- API freeze; docs site; security review of CLI; benchmarks re-run and published.

**Acceptance criteria**
- [ ] Decision recorded on an opt-in `getT(ns)` via `next/root-params` ([ADR 0007](docs/adr/0007-root-params-not-default.md), [#24](https://github.com/MrLouisWright/next-tongue/issues/24)), with tests for two root layouts and locale switch under `"use cache"`.
- [ ] No breaking changes for 4 weeks; 3+ external production-like apps report success.
- [ ] All docs pages verified against real code (doc examples are type-checked in CI).

## v1.0 — Stable
**Acceptance criteria**
- [ ] Semver guarantees documented; deprecation policy; support policy per [ADR 0011](docs/adr/0011-supported-next-versions.md).
- [ ] Zero open `priority: critical` bugs.

## v1.1 — Editor & user preferences
- VS Code extension in `packages/vscode` (VS Code API only): inline previews, missing-key diagnostics, go-to-message, hover with all locales [#47](https://github.com/MrLouisWright/next-tongue/issues/47).
- Per-user preferred language: `setLocalePreference` action helper, signed cookie, `createProxy({ resolveLocale })` [#48](https://github.com/MrLouisWright/next-tongue/issues/48). No DB call in the proxy; no headers in cached scopes.

**Acceptance criteria**
- [ ] Extension published (Marketplace + Open VSX) with no runtime dependency beyond the VS Code API.
- [ ] Preference recipe e2e: save → signed cookie → proxy resolves locale; tampered cookie ignored.

## Post-1.0 — Codemods
- `tongue migrate next-intl` ([#31](https://github.com/MrLouisWright/next-tongue/issues/31)): before 1.0 only message-file migration and the `useTranslations` → `useT` client mapping are documented; the full codemod (locale threading with `TODO(tongue)` comments + a report) comes after 1.0, measured on 3 real OSS apps.
- The next-international codemod is **dropped** (no upstream release since Oct 2024).

## v1.x and beyond (ideas, not commitments)
MessageFormat 2; MDX/content localization; Vite/React Router adapter on the same compiler; VS Code extension (inline previews, go-to-message); TMS sync (XLIFF/PO export); opt-in per-locale client splitting once measured ([ADR 0009](docs/adr/0009-client-message-delivery.md)).
