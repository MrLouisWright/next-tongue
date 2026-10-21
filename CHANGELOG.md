# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project will adhere to [Semantic Versioning](https://semver.org/) from v1.0 (0.x releases may break between minors).

## [Unreleased]

### Added
- (none yet)

## [0.9.17] — 2026-10-21

### Fixed
- `tongue --help` / `tongue -h` now exit 0; bare `tongue` (no command, no help flag) still exits 2.

## [0.9.16] — 2026-10-18

### Fixed
- Server runtime state lives on `globalThis` so `#tongue/runtime` + `getT` share one wiring even when Turbopack duplicates `next-tongue/server`.
- `t.dynamic({ from: [...KEYS] })` resolves same-file const spreads; rewrite misses throw `TONGUE_E_NOT_REWRITTEN` (clearer than `TONGUE_E_NO_PROVIDER`).
- `tongue check` getT/useT binding scan tolerates type annotations, multiline args, and `as const` on the namespace.

### Added
- `next-tongue/navigation/server` — server-safe `createNavigation` (`Link` requires `locale`).
- `tongue init` writes package.json `"#tongue/*": "./.tongue/*.js"`.
- Existing-site checklist in routing docs; adopter **louiswright.co.uk** (freeze external apps **3/3**).

## [0.9.15] — 2026-10-18

### Added
- `mergeProxyResponse(prior, tongue)` and `createProxy({ wrapResponse })` so CSP/nonce on a prior `NextResponse.next()` survive locale rewrite/redirect.
- `--proxy merge` wrap now merges passthrough `next()` headers via `mergeProxyResponse`.
- `PathnameInput.hash` and string hrefs with `?` / `#` preserved through `getPathname` / `Link` (pathnames lookup uses the path alone).
- `getDir` re-exported from `next-tongue/client` for HtmlLang helpers.

### Fixed
- Generated `t.rich` tag args are `(chunks: ReactNode) => ReactNode` (was `unknown`).

### Docs
- First-class hybrid root `<html>` + HtmlLang + nested `TongueProvider` recipe; server `getT` footer; maintenance/auth rewrite trap next to compose; init sample `home` cleanup / `--force`.

## [0.9.14] — 2026-10-18

### Added
- `tongue init --proxy merge|skip|overwrite`: merge wires `createProxy` into an existing `proxy.ts` / `middleware.ts` (final `NextResponse.next()` → `tongue(req)`, or wrap the handler); skip is the default; overwrite replaces with the scaffold.

## [0.9.13] — 2026-10-18

### Added
- Catalog `$meta` unused suppressors: `planned`, `ignoreUnused`, `@tongue-ignore` (per key or namespace `$meta`). Honored by `tongue check` unused and `tongue extract --prune`. Prefer these over blunt `strict.unusedIgnore` globs for reserved keys.

## [0.9.12] — 2026-10-18

### Fixed
- Call-site loader **imports** `useLocale` (merges into the existing `next-tongue/client` import). Injecting only the call left Safari with `Can't find variable: useLocale`.

### Added
- `tongue check` `client-loader` error when a `"use client"` + `useT` rewrite would call `useLocale` without importing it.
- `#tongue/runtime` exports `prefix` and `routing` (`{ locales, defaultLocale, prefix }`) for createProxy / createNavigation / shells.
- `withTongue` warns when `.tongue/runtime.js` is missing; `tongue init` logs `src/app` choice and prints a compose snippet when proxy already exists.

## [0.9.11] — 2026-10-18

### Fixed
- Call-site loader injects `__tongue_locale` after **every** `useT()` (per component / binding), not only the first in the file — multi-component client modules no longer reference an out-of-scope locale.

## [0.9.10] — 2026-10-18

### Added
- `getT(locale, ['home', 'common'])` returns `{ home, common }` translators (one await).
- `t.dynamic` first argument narrowed to `from[number]` when `from` is a const tuple.
- Auto `ensureTongue`: generated `#tongue/runtime` runs it on import; `getT`/`getFormat` lazy-load that module when using `withTongue` (no per-page boilerplate).

## [0.9.9] — 2026-10-18

### Fixed
- ICU apostrophe warnings are locale-aware (fr/it/… only — no English `don't` flood).
- `tongue check` a11y recognizes `HtmlLang` / `setAttribute('lang'|'dir')` on root layouts.

### Added
- `requestLocale` + `LOCALE_COOKIE_NAME` / `LOCALE_HEADER_NAME` for Route Handlers and actions.
- `usePathnameWithoutLocale` (bound + unbound) for as-needed active states without hand-rolled regexes.

### Docs
- Hybrid routing allow-list + optional `beforeFiles` rewrite; root TongueShell + nested providers; nav style choice; Vercel `tongue build && next build`; cookie/`x-locale` convention.

## [0.9.8] — 2026-10-17

### Fixed
- Reserved message keys (`continue`, `default`, …) sanitize to valid JS idents in per-key and namespace modules (`continue_`).
- `tongue build` writes `.tongue` via staging + rename; clearer recovery when the dir is locked (`ENOTEMPTY`).
- `tongue check` errors on client `useT` + `t(variable)` (`dynamic`); scans `lib/`, `server/`, `actions/` by default; warns on likely unescaped ICU apostrophes (`icu`).

### Added
- `scan.include` and `strict.unusedIgnore` config options.
- Docs: when to use `getT` / `useT` / `t.dynamic`, ternaries, one `TongueProvider`, prod Turbopack loader.

### Docs
- Freeze start 2026-10-17; Noticed Sites recorded as first external adopter.

## [0.9.7] — 2026-10-17

### Fixed
- Call-site loader (and `tongue check`) resolve `t.dynamic` `from` when it is a same-file `const` array or `Object.values(sameFileObject)`, not only an inline `[...]` literal.

## [0.9.6] — 2026-10-17

### Fixed
- Call-site loader re-hoists `"use client"` / `"use server"` before injected imports (Next was 500ing every rewritten client file).
- Loader rewrites `t.dynamic(key, { from: [...] })` to a map of per-key imports so dynamic keys work without `loadNamespace`.

## [0.9.5] — 2026-10-17

### Fixed
- Call-site loader runs on the SSR graph too (Turbopack no longer `browser`-only; webpack loader applies on server) so client `useT` rewrites during SSR.
- Dev overlay: defer `notify()` with `queueMicrotask` so `t()` during render does not update DevOverlay mid-tree.
- `tongue check`: strip comments before scanning; stop treating unrelated string arrays (cache tags) as message keys.

### Docs
- Apostrophe-escape angle brackets in messages (`'<id>'`).
- Root-layout chrome pattern for Header/Footer outside `[locale]`.

## [0.9.4] — 2026-10-17

### Fixed
- Dev overlay: cache `getTongueDevSnapshot()` until `notify()` so React `useSyncExternalStore` / `getServerSnapshot` does not infinite-loop.
- `useT()` no longer throws during SSR when `TongueProvider` has no `loadNamespace` (call-site loader delivers keys); invoking a non-rewritten `t` still throws with a clearer hint.
- `tongue check` unused: honor `t.dynamic({ from })`, `t(var)` + string arrays, and `t.ns` so dynamically used keys are not false-flagged.

## [0.9.3] — 2026-10-17

### Fixed
- `tongue init`: scaffold `createProxy({ locales, defaultLocale, prefix })` (zero-arg was invalid); detect `src/app` + `src/proxy.ts`; skip existing proxy/middleware; omit `<html>` under `[locale]` when a root layout exists; add `tsconfig` `paths` for `#tongue/*`.
- `tongue check` a11y: accept `lang`/`dir` on the root layout (or `document.documentElement.*`) when `[locale]` is nested.
- `withTongue`: append Turbopack `*.tsx`/`*.jsx` loader rules instead of replacing user rules.

### Changed
- Docs: beta status, `createProxy` / `createNavigation` signatures, partial-localization + compose guidance, troubleshooting for real-app adoption feedback.

## [0.9.2] — 2026-10-17

### Fixed
- npm package ships `README.md` and `LICENSE`; package metadata (`repository`, `homepage`, `bugs`, `keywords`).
- Publish tarball no longer includes source maps, declaration maps, or test emit leftovers.

## [0.9.1] — 2026-10-17

### Fixed
- Turbopack no longer pulls `next/root-params` into proxy/middleware graphs when `routing.rootParams` is off (broke `examples/basic` and any app importing `next-tongue/server` from a shared runtime). Load is opaque until the opt-in path runs.

### Added
- [Adopters / freeze verification](docs/adopters.md): in-repo production-like `next build` results for five examples.

## [0.9.0] — 2026-10-17

First public beta. API surface frozen per [docs/api-freeze.md](docs/api-freeze.md). npm publish starts the 4-week freeze timer (see ROADMAP).

### Added
- **Library (`next-tongue@0.9.0`):** `packages/next-tongue` — pnpm workspace, TypeScript, Vitest, ESLint, GitHub Actions (Node 20/22), changesets, CI dependency budget (#1, #28).
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
- Typed `Format` helpers: `list`, `relativeTime`, `unit` (`SanctionedUnit`), `displayName` with per-locale+options caching (#45).
- Pseudo-localisation: `pseudo: true | { locale, enabled, expand }` emits `en-XA` (accent + expand), excluded from production `localeParams` / detection by default (#36).
- Precomputed Accept-Language matcher (exact / parent / language tables + LRU); codegen emits `.tongue/locale-matcher.js`; 150-locale bench gate (#18).
- `generateAlternates` / `createGenerateAlternates` for hreflang + `x-default` (prefix, pathnames, domains) (#13).
- Server-action locale patterns + `withLocale` / `isLocale` (empty-runtime safe); contact e2e in `examples/basic` (#26).
- `examples/basic` `proxy.ts` with as-needed routing; Playwright covers canonical `/en`→`/`, Accept-Language, and SameSite=Lax cookie.
- ADR 0008 hydration demo (server `getFormat` + client `useFormat` under config `timeZone`) and `generateMetadata` via `getT`; Playwright asserts match under `America/New_York`.
- `translateIssues(t, issues)` — Standard Schema–shaped validation errors → `Record<path, string[]>` (#38).
- Headless `LocaleSwitcher` / `useLocaleSwitcher` via `createNavigation` (DisplayNames labels, plain links) (#44).
- `examples/og-email`: prerendered `opengraph-image` / `twitter-image` with `getT`+`getDir` (RTL `ar` snapshot), welcome-email route with `t.rich` (#39).
- Docs sample CI: extract ```ts typecheck / ```tsx typecheck fences and `tsc` them (`pnpm check:docs`) (#16).
- Dev overlay in `TongueProvider` (`Alt+Shift+T`): locale/timeZone, missing/fallback keys, client-loaded keys, escapes; inspect click-to-key + editor links; key ids gated by `NODE_ENV` and asserted absent from the production client bundle (#35).
- `tongue check`: missing / unused / undefined / mismatch / syntax / stale with `pretty|json|github` reporters and `--max-warnings` (exit 0/1/2).
- `tongue extract`: scan `t`/`t.rich` under `useT`/`getT`, add missing default-locale keys, optional `--prune` / `--dry-run`, then rebuild.
- `tongue init`: scaffold config, messages, proxy, `[locale]` layout (`generateStaticParams = localeParams`), `withTongue`, `#tongue` imports (`--yes` / `--force` / `--dry-run`).
- CI gate `bench:check`: `tongue check` on 10k keys / 500 files under 5 s.
- Proxy + navigation: localized `pathnames` (both ways), `domains` host matching, `prefix: 'never'` rewrites; `examples/routing` Playwright e2e (#32).
- `tongue check` `a11y` (html lang/dir) and `bidi` (unbalanced controls, RTL arg isolation) with ar/he/fa fixtures (#40).
- Build-time `sources` in `tongue.config`: awaited, merged after files, typed/compiled; `sourcesOnError: 'use-cache'`; duplicate-key warning in `tongue check` (#33).
- `tongue export` / `tongue import` for XLIFF 2.0 and CSV (Node built-ins only), with ICU validation and tongue.lock updates (#37).
- `tongue check` `length`: flag targets longer than `$meta.maxLength` (#43).
- `tongue report`: scan `.next` client chunks for per-key markers; `--json` / `--max-bytes` (#41).
- `examples/monorepo`: shared messages package + web/admin apps with `declaration: true` (no TS2742) (#21).
- `tongue translate`: OpenAI-compatible Chat Completions via global `fetch`, ICU masking/restore, glossary + lockfile, `$meta` in prompts, `--dry-run` / `--review` (CI default) / `--accept` / `--max-cost`, API-key redaction tests (v0.5).
- `setLocalePreference` + `verifyLocalePreference` (HMAC-SHA-256 via Web Crypto) and `createProxy({ resolveLocale })` for signed preference cookies; basic example settings + e2e (#48).
- `translate.maxTokens` / `--max-cost` documented on `tongue translate`.
- Opt-in `routing.rootParams`: `getT(ns)` / `getFormat()` via `next/root-params`; `withTongue` sets `experimental.rootParams`; ADR 0007 amended (#24).
- `packages/vscode`: hover, go-to-message, missing-key diagnostics, inlay previews from `.tongue/manifest.json` (VS Code API only); manifest gains `source` / `byLocale` (#47).
- `tongue migrate next-intl`: client `useTranslations` → `useT`, locale-in-scope `getT` threading, `TODO(tongue)` + `--out` JSON report (#31; OSS measurement post-1.0).
- [Versioning, deprecation & support](docs/versioning.md) for v1.0; README support policy.
- VS Code extension: README, `vsce`/`ovsx` package scripts (#47 publish prep).
- v0.9: API freeze doc, CLI path containment (`resolveInsideProject`), SECURITY.md CLI review, docs site status refresh, migrate fixture, benchmarks re-run; fix tsc-budget key/arg pairing; restore `@next-tongue/benchmarks` package name.



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

`0.9.0` is ready to publish; until it appears on the npm registry, install from git. See [docs/releasing.md](docs/releasing.md).
