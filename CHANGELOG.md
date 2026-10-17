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
- `examples/basic` and `examples/static-export` (`output: 'export'`, `prefix: 'always'`) (#15).
- ICU conformance corpus expanded (`subset.json` + `format.json` roundtrips) (#27).
- Codegen emits `.tongue/ns/*.d.ts`; esbuild tree-shake test for unused per-key modules (#4).
- Benchmark harness scaffold: 500-key fixture + esbuild min+gz measure for next-tongue (#25).
- Playwright e2e for basic / cache-components / static-export (6 tests); CI e2e job (#15).
- Early check: `cacheComponents` + `output: 'export'` fails on Next 16.4.2 (PPR); documented in `examples/cache-export-probe/RESULT.md` and static-export docs (#15).
- Benchmark proxies for next-intl `pick` and Paraglide-style per-message delivery + `summary.json` (#25).
- `withTongue` warns on bad `output: 'export'` / prefix / domains combos and missing `generateStaticParams`; loader ADR constraint test (#8).
- Codegen emits `.tongue/runtime.js` (`ensureTongue`, `localeParams`, `locales`) so apps no longer hand-roll namespace loaders (#10, #8).
- Server: `LocaleProps`, `withLocale`, `getLocales`/`getDefaultLocale`; test that server/runtime never call `headers`/`cookies`/`draftMode` (#10).
- Client: `TONGUE_E_NO_PROVIDER`; `TongueProvider` passes only locale by default (#11).
- e2e asserts no message-catalog JSON in HTML (#20); nightly `next@canary` workflow (#29).
- Turbopack call-site loader via `condition.content` RegExp (no `as` doubling); webpack path verified with `next build --webpack` (#8).
- Client runtime size gate: ≤ 2 kB min+gz (currently ~1.6 kB gz) (#11).
- Watcher singleton/lockfile tests + stale-PID takeover; escape-analysis tests for return/arg/object/JSX (#11, #23).
- `t.rich` codegen: tag handlers → ReactNodes with stable `tongue-t{n}` keys; `.tongue/rich.js` helpers; loader rewrites `t.rich('key')` (#7).
- Benchmark matrix (keys × locales × used) + SSR 1k-call timing (`results/matrix.json`, `results/ssr.json`) (#25).
- Typed `TFunction<N>` / `getT` / `useT` indexing per-namespace `TongueRegister`; 10k-key tsc budget harness (`benchmarks/tsc-budget`, Check ≤ 2s) (#6).
- `docs/type-safety.md` budget measured via `pnpm --filter @next-tongue/benchmarks run measure:tsc`.
- Real next-intl competitor app (`benchmarks/apps/next-intl`) with `precompile` + 2-of-500 narrowed catalog; RSC/HTML measure → `results/next-intl-app.json` (#25).
- Real Paraglide JS compile fixture (`benchmarks/apps/paraglide`) with tree-shaken k0+k1 measure → `results/paraglide-real.json` (#25).
- Lingui narrowed-catalog fixture (`benchmarks/apps/lingui`) → `results/lingui.json`; provisional #25 go/no-go in ROADMAP (#25).
- Watcher soak script: 1,000 edits, heap growth &lt; 10%, lock cleanup (`pnpm --filter next-tongue run soak:watcher`) (#23).
- Empty `TongueRegister` + conditional `Locale`/`Namespace`/`MessageKey` so codegen can narrow types; `expect-type` coverage for the type-safety table.
- `createProxy`: `always` / `as-needed` prefix routing, cookie + Accept-Language detection, open-redirect guards, canonical `/en/*` → `/*` (#9, #30).
- `createNavigation`: `Link`, `redirect`, `useRouter`, `usePathname`, `getPathname` with prefix + localized pathnames (#12).
- IANA `timeZone` validation + `TONGUE_W_TIMEZONE` client mismatch warning (ADR 0008, #17).
- `formatMessage` / `formatMessage.rich` with bounded LRU, tag stripping, allow-listed rich tags (#34).
- Proxy locale sanitization (traversal/CRLF) + XSS corpus tests; localeCookie sameSite/secure/path covered (#19, #46).
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
