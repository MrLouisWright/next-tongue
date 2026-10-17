# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project will adhere to [Semantic Versioning](https://semver.org/) from v1.0 (0.x releases may break between minors).

## [Unreleased]

### Added
- **Library code (pre-alpha, unpublished):** `packages/next-tongue` — pnpm workspace, TypeScript, Vitest, ESLint, GitHub Actions (Node 20/22), changesets, CI dependency budget (#1, #28).
- `defineConfig` + validated config loader (BCP 47 locales, `{locale}` in messages) (#2).
- Own ICU MessageFormat parser with documented subset, `file:key:line:col` errors, and a starter conformance corpus (#3, #27).
- Codegen (`tongue build`): per-key modules under `.tongue/msg/`, namespace modules, CLDR fallback chains, lazy `Intl` formatters (#4, #22).
- CLDR plural-category checks via `Intl.PluralRules` (#5).
- Type generator: `.tongue/types.d.ts` with per-namespace `TongueRegister` interfaces (#6).
- Core runtime: `createT` (`t` / `t.rich` / `t.has` / `t.dynamic` / `t.ns`), `createFormat`, `getDir` / `getOgLocale` (#7).
- Server/client export surfaces (`getT`, `TongueProvider`/`useT`), `withTongue` config wrapper + call-site loader, CLI `tongue build` (#8, #10, #11 — partial).
- `examples/cache-components`: Next 16 Cache Components app; `next build` prerenders `/en` and `/de` as static (#15 — in progress).
- Project planning and documentation (three review passes): README, `docs/` (planned API), ROADMAP with acceptance criteria, ADRs 0001–0008, community health files, issue/PR templates, wiki pages in `/wiki`.
- Critical technical review as [docs/review.md](docs/review.md) (and a wiki page).
- ADR 0009 (client message delivery), ADR 0010 (own ICU parser with a documented subset), ADR 0011 (supported Next versions + nightly canary CI), ADR 0012 (zero dependencies beyond `next`/`react`, CI dependency budget), ADR 0013 (database and CMS messages).
- Planned features documented: build-time `sources` and server `formatMessage` ([database-messages](docs/database-messages.md)); dev overlay, `en-XA` pseudo-localisation and `tongue report` ([dev-tools](docs/dev-tools.md)); `tongue export`/`import` for XLIFF 2.0 and CSV, translator context (`$meta`) and stale detection ([translator-workflow](docs/translator-workflow.md)); `translateIssues`; translated OG images and emails; a11y/bidi checks; headless `LocaleSwitcher`; typed `Intl` helpers; per-user preferred language recipe ([user-preferences](docs/user-preferences.md)); VS Code extension ([vscode](docs/vscode.md)); threat model in SECURITY.md.
- Issues #25–#48 and milestones "Post-1.0 — Codemods" and "v1.1 — Editor & user preferences".

### Changed
- ADR 0001 rewritten: no bundler plugin hooks under Turbopack; codegen at `next.config` load / `tongue build` plus a per-file call-site loader; per-key granularity. `withTongue` moved from `next-tongue/plugin` to `next-tongue/next` and is described as a config wrapper.
- ADR 0002 amended (server actions, routes outside `[locale]`, `localeParams` as `generateStaticParams`); ADR 0004 amended (per-namespace interfaces, relative tsc budget).
- ROADMAP restructured: v0.1 "Prove the differentiator" with a published bundle benchmark vs next-intl (precompile) and Paraglide as a go/no-go gate; then proxy & navigation, check/extract, pathnames/domains/monorepo, translate, v0.9 freeze with the root-params decision (#24). Scope freeze until v0.1 ships.
- Client delivery: server-translated strings are the primary pattern; client keys ship all locales by default; dynamic keys must declare their possible keys (`t.dynamic(key, { from })`, `t.ns`).
- README: defensible positioning; Paraglide row corrected (Next 16 setup, plugin needs `--webpack`); gt-next column; next-intl experimental `precompile` noted; no "faster", "only the active locale on the client" or "first Cache Components-native" claims.
- Documented gotchas: proxy matcher skips dotted paths; `as-needed` redirects `/en/*` to `/*`; `localeParams` exported as `generateStaticParams`; static export supports only `prefix: 'always'`; early check that `cacheComponents` + `output: 'export'` build together.
- Issues #3, #4, #6, #7, #8, #9, #10, #11, #15, #18 and #20 edited; issues re-milestoned; milestones renamed to the new roadmap.

### Removed
- Codemods moved after v1.0; the next-international codemod is dropped (migration page kept as a manual guide).
- The "runtime catalogs from a CMS" non-goal (superseded by ADR 0013); client-side runtime catalogs remain out of scope.

No package has been published to npm yet (still pre-alpha).
