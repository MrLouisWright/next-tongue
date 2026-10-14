# Roadmap

> **Status: pre-alpha.** Dates are not promised. Each milestone ships when its acceptance criteria are met. Tracked in [GitHub milestones](https://github.com/MrLouisWright/next-tongue/milestones) and issues.

## v0.1 — Compiler core
Goal: turn message files into typed, tree-shakeable modules, independent of Next.js.
- `defineConfig` + config loader with validation (BCP 47 locales, `defaultLocale ∈ locales`, `{locale}` in `messages`).
- ICU MF1 parser → AST with precise error locations.
- Code generator: per-`(locale, namespace)` ES modules, one pure function per key; fallback chains resolved.
- CLDR plural-category validation per locale.
- Type generator: `.tongue/types.d.ts` with `TongueRegister`.
- Core `T` runtime (`t`, `t.rich`, `t.has`, `t.dynamic`) and `Format`.
- Repo tooling: pnpm workspace, TS, Vitest, lint, CI, changesets.

**Acceptance criteria**
- [ ] Compiling a fixture with 3 locales produces modules where unused keys are removed by esbuild/Rollup tree-shaking (asserted in tests).
- [ ] Every ICU construct in [ICU messages](docs/icu-messages.md) compiles and matches FormatJS output for a shared test corpus.
- [ ] Invalid ICU reports `file:key:line:col`.
- [ ] `tsd`/`expect-type` tests cover every row of the "What is checked" table in [Type safety](docs/type-safety.md).
- [ ] Type-checking a generated 10,000-key registry takes < 2 s on CI (measured, published in PR).
- [ ] Default fallback follows CLDR parent locales and never crosses scripts (`zh-Hant-HK → zh-Hant`, never `zh-Hans`); explicit `fallback` overrides ([research A7](docs/research.md)).
- [ ] Generated date formatters always pass the configured `timeZone` (default `'UTC'`); no code path uses the runtime default zone ([ADR 0008](docs/adr/0008-explicit-time-zone.md)).
- [ ] CI green on Node 20 and 22.

## v0.2 — Next.js 16 integration
- `withTongue` plugin for Turbopack and webpack; dev watch + HMR.
- `createProxy` for `proxy.ts`: prefix strategies, detection, cookie, domains, localized pathnames.
- `next-tongue/server`: `getT`, `getFormat`, `isLocale`, `localeParams`, `generateAlternates`, `getDir`.
- `next-tongue/client`: `TongueProvider`, `useT`, `useFormat`, `useLocale`; client call-site transform.
- `next-tongue/navigation`: `Link`, `redirect`, `permanentRedirect`, `useRouter`, `usePathname`, `getPathname`.
- `next-tongue/testing`.
- Example apps: `examples/basic`, `examples/cache-components`, `examples/static-export`.

**Acceptance criteria**
- [ ] `examples/cache-components` (`cacheComponents: true`) builds; all localized routes are reported as prerendered (static or PPR) by `next build`.
- [ ] No next-tongue code path calls `headers()`, `cookies()` or `draftMode()` (lint rule + test).
- [ ] `examples/static-export` builds with `output: 'export'` and `dynamicParams = false`.
- [ ] A client component using 2 of 500 keys ships only those 2 message functions for 1 locale (bundle analysis test).
- [ ] Playwright e2e for all three prefix strategies, detection, cookie, and localized pathnames.
- [ ] `generateAlternates` output validated against Google hreflang rules (reciprocal, `x-default`).
- [ ] Client runtime ≤ 2 kB min+gz enforced by `size-limit`.
- [ ] Works in both `next dev` (Turbopack) and `next build --webpack`.
- [ ] No catalog JSON appears in the RSC payload or HTML of any example route (e2e assertion on the flight response) ([research A4](docs/research.md)).
- [ ] `createProxy` locale resolution: p50 < 1 ms and p99 < 3 ms with 150 locales (benchmark in CI); no `Intl.*` construction per request ([research A3](docs/research.md)).
- [ ] Locale cookie is `SameSite=Lax` by default and is sent on a cross-site navigation in Playwright ([research A5](docs/research.md)).
- [ ] Hydration test: a page that formats a date in the static shell and a client component shows no hydration warning when the server process `TZ` differs from the browser zone ([ADR 0008](docs/adr/0008-explicit-time-zone.md)).
- [ ] `getT` works in `generateMetadata` and a server action on a freshly started worker (cold-start test) ([research A8](docs/research.md)).
- [ ] A pnpm-workspace fixture (shared messages package + 2 apps, `declaration: true`) builds and type-checks with no TS2742 ([research A6](docs/research.md)).
- [ ] Dev watch mode: memory stays flat (< 10% growth) over a 30-minute soak with 1,000 message edits; no child process outlives `next dev` ([research A9](docs/research.md)).

## v0.3 — CLI: init, extract, check
**Acceptance criteria**
- [ ] `tongue init` on `create-next-app@16` output yields a building app (`--yes`), idempotent on second run.
- [ ] `tongue extract` finds keys in `.ts/.tsx/.js/.jsx/.mdx`, adds missing source keys, `--prune` removes unused.
- [ ] `tongue check` implements all six checks in [CLI](docs/cli.md) with `pretty|json|github` reporters and documented exit codes.
- [ ] `tongue check` on a 10k-key, 500-file repo completes in < 5 s.

## v0.4 — AI translation
**Acceptance criteria**
- [ ] Works against OpenAI and a local Ollama endpoint in CI (recorded fixtures for OpenAI).
- [ ] Glossary enforcement and lockfile semantics exactly as in [AI translation](docs/ai-translation.md).
- [ ] 100% of written outputs pass ICU parse + arg/tag/plural parity; invalid outputs never written.
- [ ] `--dry-run` makes zero network calls (test).
- [ ] API key never appears in logs, lockfile or error output (test).

## v0.5 — Migration codemods
**Acceptance criteria**
- [ ] `tongue migrate next-intl` converts the official next-intl App Router example to a building next-tongue app with ≤ 5 manual TODOs.
- [ ] Same for a next-international App Router example.
- [ ] Every mapping row in the migration guides has a codemod fixture test.

## v0.9 — Beta
- API freeze; docs site; published, reproducible benchmarks vs next-intl and Paraglide (bundle size, build time) with scripts in repo; security review of CLI.
**Acceptance criteria**
- [ ] No breaking changes for 4 weeks; 3+ external production-like apps report success.
- [ ] All docs pages verified against real code (doc examples are type-checked in CI).
- [ ] Decision recorded on an opt-in `getT(ns)` via `next/root-params` ([ADR 0007](docs/adr/0007-root-params-not-default.md)), with tests for two root layouts and locale switch under `"use cache"`.

## v1.0 — Stable
**Acceptance criteria**
- [ ] Semver guarantees documented; deprecation policy; LTS on latest Next.js major.
- [ ] Zero open `priority: critical` bugs.

## v1.x and beyond (ideas, not commitments)
MessageFormat 2; MDX/content localization; Vite/React Router adapter on the same compiler; VS Code extension (inline previews, go-to-message); TMS sync (XLIFF/PO export).
