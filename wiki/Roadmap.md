> 📄 Mirrors [`ROADMAP.md`](https://github.com/MrLouisWright/next-tongue/blob/main/ROADMAP.md) in the main repo — the repo version is canonical.

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
- [ ] Every ICU construct in [ICU messages](ICU-Messages) compiles and matches FormatJS output for a shared test corpus.
- [ ] Invalid ICU reports `file:key:line:col`.
- [ ] `tsd`/`expect-type` tests cover every row of the "What is checked" table in [Type safety](Type-Safety).
- [ ] Type-checking a generated 10,000-key registry takes < 2 s on CI (measured, published in PR).
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

## v0.3 — CLI: init, extract, check
**Acceptance criteria**
- [ ] `tongue init` on `create-next-app@16` output yields a building app (`--yes`), idempotent on second run.
- [ ] `tongue extract` finds keys in `.ts/.tsx/.js/.jsx/.mdx`, adds missing source keys, `--prune` removes unused.
- [ ] `tongue check` implements all six checks in [CLI](CLI) with `pretty|json|github` reporters and documented exit codes.
- [ ] `tongue check` on a 10k-key, 500-file repo completes in < 5 s.

## v0.4 — AI translation
**Acceptance criteria**
- [ ] Works against OpenAI and a local Ollama endpoint in CI (recorded fixtures for OpenAI).
- [ ] Glossary enforcement and lockfile semantics exactly as in [AI translation](AI-Translation).
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

## v1.0 — Stable
**Acceptance criteria**
- [ ] Semver guarantees documented; deprecation policy; LTS on latest Next.js major.
- [ ] Zero open `priority: critical` bugs.

## v1.x and beyond (ideas, not commitments)
MessageFormat 2; MDX/content localization; Vite/React Router adapter on the same compiler; VS Code extension (inline previews, go-to-message); TMS sync (XLIFF/PO export).
