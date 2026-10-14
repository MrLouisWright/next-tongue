> 📄 Mirrors [`docs/review.md`](https://github.com/MrLouisWright/next-tongue/blob/main/docs/review.md) in the main repo — the repo version is canonical.

# next-tongue: adversarial technical review of the plan

> Copied from the review delivered on 14 Oct 2026; Louis approved all recommended changes. Two later decisions override it: **zero dependencies** ([ADR 0012](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0012-zero-dependencies.md)) replaces the advice to reuse `@formatjs/icu-messageformat-parser` with an own parser ([ADR 0010](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0010-own-icu-parser.md)), and **database/CMS messages** are now supported ([ADR 0013](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0013-database-and-cms-messages.md)). Issue numbers below refer to the state at review time.

- Reviewed: 14 Oct 2026. Repo state: docs only (README, ROADMAP.md, docs/, docs/adr 0001–0008, docs/research.md, issues #1–#24).
- Scope: whether the planned mechanisms can work on Next.js 16.x, how the plan compares with competitors, performance, risks and scope. The repo has no code yet, so every judgement below is about the design.
- Bottom line: the server and routing half of the plan is sound, and on Next 16 the work there is mostly execution. The headline feature is "per-route tree-shaking of client messages through a Turbopack plugin, with only the active locale shipped". It is **not buildable as described**, because Turbopack exposes only per-file webpack loaders: there are no plugins, no module-graph hooks and no `emitFile`. It can be redesigned into something achievable and still differentiated (see M2). The competitive window is also narrower than the README suggests. Paraglide JS 2 already documents a Next 16.4 setup with a `[locale]` root layout, an explicit locale and Cache Components. next-intl 4.8+ already precompiles ICU at build time behind a flag.

---

## 1. Verdict per mechanism

| # | Mechanism | Verdict | One-line reason |
|---|---|---|---|
| M1 | Build-time compilation via `withTongue` under Turbopack | **Works with caveats** | Possible only as a pre-build codegen step plus a per-file loader. "Plugin" in the webpack sense does not exist in Turbopack. |
| M2 | Per-route client tree-shaking, active locale only | **Won't work as designed** | Needs whole-graph knowledge that a Turbopack loader never sees. A per-call-site redesign works. |
| M3 | Locale from params inside cached scopes | **Works** | A plain argument is a cache key. Watch out for `generateStaticParams` and client-provider edge cases. |
| M4 | `createProxy` in `proxy.ts` | **Works** | A public, stable file convention. The < 1 ms target is plausible. |
| M5 | Static export | **Works with caveats** | No proxy, so only `prefix: 'always'` works. Root redirect is via meta refresh/host. Check `cacheComponents` together with `output: 'export'`. |
| M6 | Generated types at 10k+ keys | **Works with caveats** | A flat map is fine. Namespace-prefix template-literal types and `t.rich` overloads are where tsc time goes. |
| M7 | ICU compilation | **Works with caveats** | Feasible, but writing a parser is wasted effort. Reuse `@formatjs/icu-messageformat-parser`. Date/number skeletons are the long tail. |
| M8 | AI translate CLI | **Works** | Simple, and decoupled from Next churn. It is also the easiest feature for others to copy. |
| M9 | Codemods (next-intl, next-international) | **Risky** | The real cost is inserting `locale` into every server call and turning `getTranslations()` with request config into explicit locale plumbing. "≤ 5 TODOs" is optimistic. |

### M1. `withTongue` under Turbopack: works with caveats
Evidence: the Next 16 `turbopack` config exposes only `rules` (webpack loaders, run through `loader-runner`), `resolveAlias`, `resolveExtensions`, `root` and `debugIds`. In loaders, `emitFile`, `loadModule` and `importModule` are unsupported and `fs` is limited to `readFile`. Loader options must be plain JSON, and "only loaders that return JavaScript code are supported". Source: https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack. There are no compiler hooks, no `buildStart`/`generateBundle`, and no way to see other modules.

What works, and what next-intl does today with `precompile` and `useExtracted` (a "Turbo- or Webpack loader", per https://next-intl.dev/docs/usage/plugin and https://github.com/amannn/next-intl/blob/main/rfcs/002-icu-message-precompilation.md):
1. **Before Next starts**, `withTongue` runs in `next.config.ts`, which executes once per `next dev`/`next build`. It compiles `messages/*.json` into `.tongue/**.js` + `.d.ts` on disk, synchronously and idempotently, keyed on a content hash.
2. `turbopack.resolveAlias` maps `#tongue/*` to `.tongue/*`. Prefer package.json `imports` (`"#tongue/*"`), which works in both bundlers **and** in tsc/Vitest without the plugin.
3. A per-file loader (`turbopack.rules` with `condition: {all:[{not:'foreign'},'browser']}` and `content: /useT\(/`) rewrites client call sites. This is a pure function of one file's source, which is what Turbopack allows.
4. In dev, a chokidar watcher started from `next.config.ts` rewrites `.tongue/*`, and Turbopack's own file watching picks up the change for HMR. Issue #23's soak/cleanup acceptance criterion is exactly the right fear. Note that `next.config.ts` can be evaluated more than once (dev server + workers), so use a lockfile/singleton.

Fix: rename "plugin" to "config wrapper + codegen + loader" in architecture.md and ADR 0001. Ban any design that needs emitFile or graph access. Make `tongue build` (CLI codegen) the source of truth, so the loader is optional and CI/tsc/Vitest work without Next.

### M2. Per-route tree-shaking of client messages: won't work as designed
Problems in docs/architecture.md §2 and docs/client-components.md:
- "The bundler emits one chunk per `(namespace, locale)` containing only referenced keys" for a *route*. That means knowing every client module on the route and unioning their keys. Turbopack gives a loader one file and no graph, so this cannot be done in a loader. Webpack could do it with a plugin, but that creates two divergent implementations, and Next 16 defaults to Turbopack.
- A single `#tongue/de/home.js` module shared by many routes is one module. Bundlers split by module, not by export-per-route, so per-route subsetting would need distinct module ids per route.
- `use(load('home', locale, ['inbox']))` adds a **network waterfall** on hydration: the client chunk loads, then the message chunk is requested, and hydration of that boundary suspends until it arrives. SSR "preload" needs `<link rel=modulepreload>` for a chunk URL the library cannot know without bundler manifests, which are an internal API. Every client component using `useT` becomes a Suspense point.
- Static key analysis breaks on ordinary code: `t` passed as a prop, stored in an object, returned from a custom hook, `const k = cond ? 'a' : 'b'; t(k)`, keys in config arrays, `useT()` without a namespace, and keys built in imported helpers. "Finite string-literal union" keys need **type information** (`status` typed as `'open'|'closed'`). The oxc AST scan in architecture.md has none, and adding the TS checker to a loader is too slow.

Redesign that works with per-file loaders only:
- **Per-call-site imports.** The loader rewrites `t('inbox', {count})` in file F to a static import from a per-key module: `import { inbox } from '#tongue/msg/home/inbox'`. Each generated per-key module holds the locale variants. The bundler then tree-shakes and dedupes per key across routes for free, which is "per-route" by construction. This is how Paraglide gets message-level tree-shaking (https://github.com/opral/paraglide-js).
- **Locale granularity is the hard trade-off.** Per-key modules with all locales inlined ship N locales per used key. Per-locale per-key modules need a dynamic import per locale and bring the waterfall back. Recommended default: **ship all locales for used keys** below a threshold of locales × keys (it compresses well), and offer **opt-in per-locale splitting** via a generated `switch(locale)` of `import()`s with a Suspense contract. Publish the measured crossover point. Do not promise "only the active locale" on the client until it is measured.
- **Better default: translate on the server and pass strings.** For most client components the cheapest bytes are none: server components call `getT` and pass rendered strings/ReactNodes as props. Make this the documented primary pattern. architecture.md already lists "RSC-only messages passed as strings" as an open question; promote it.
- **Dynamic keys:** require a declared key set, `t.dynamic(key, { from: ['status.open','status.closed'] })` or `t.ns('status')`, which imports a generated per-namespace module. Drop the "infer the finite union from the type" promise; it needs the type checker.
- **Escape analysis:** if `t` escapes (passed as an argument or returned), the loader falls back to the whole namespace and warns with the file:line.

### M3. Locale from params in cached scopes: works
- An explicit `locale` argument to a `'use cache'` function becomes part of the cache key. This is how Cache Components is meant to be used: https://nextjs.org/docs/app/api-reference/directives/use-cache. Paraglide's Next 16.4 guide uses the same pattern: a `[locale]` root layout, awaited params and the locale passed explicitly (https://paraglidejs.com/next-js). That validates the idea and also removes it as a differentiator.
- Caveats to cover with tests:
  - Under `cacheComponents`, `params` without `generateStaticParams` are runtime data. The shell is static only when `localeParams` is exported at the root `[locale]` layout. Make `tongue init` write it, and make `withTongue` warn when it is missing.
  - Nested dynamic segments need their own `generateStaticParams`.
  - `TongueProvider` is a client component taking `locale` from the layout. That is fine, but `useT` inside client components rendered **outside** `[locale]` (global not-found, `app/page.tsx` for export) has no provider. Define the behaviour.
  - Server actions receive no params. The locale must be passed as a bound argument or hidden field. docs/server-actions.md should show `action.bind(null, locale)`.
- Cost: verbosity. Mitigate with `createTranslator(locale)` per page and a typed `LocaleProps` helper. Keep ADR 0007's root-params opt-in on the v0.9 plan (issue #24).

### M4. `createProxy` in `proxy.ts`: works
- `proxy.ts` is the stable Next 16 convention: https://nextjs.org/docs/app/api-reference/file-conventions/proxy. It is a request-in, response-out function, so composition as shown in routing-and-proxy.md is fine.
- Precomputed matching tables are sound. The 150-locale p50 < 1 ms target is easy if negotiation is a Map lookup over a parsed `Accept-Language`. Also cache the parsed header string → result in an LRU.
- Caveats:
  - The README's quick-start matcher `'/((?!api|_next|.*\\..*).*)'` excludes every path with a dot, so `/de/blog/v1.2` would bypass the proxy. Document it.
  - `prefix: 'as-needed'` with a rewrite of `/` → `/en` makes `/en/*` reachable twice. A canonical redirect `/en/x → /x` is needed (next-intl does this).
  - `pathnames` localization requires the proxy to know the route manifest. Generate it from `app/` at codegen time and do not read Next internals.

### M5. Static export: works with caveats
- Proxy/middleware is not supported with `output: 'export'` (https://nextjs.org/docs/app/guides/static-exports, "Unsupported Features"). The doc already handles this: `prefix: 'always'`, meta-refresh root, host redirects.
- Verify early, in a v0.2 example, that `cacheComponents: true` plus `output: 'export'` builds on the current 16.x. The README example combines them, and this pairing has had rough edges. If it fails, drop `cacheComponents` from the export example rather than block.
- `dynamicParams = false` works because locales are enumerable. Good. next-intl#2060 is a fair motivation.

### M6. Generated types at scale: works with caveats
- A flat `'ns.key' → Args` interface is O(1) property lookup and scales well. The costs are generic APIs that compute `Extract<keyof Messages, \`${N}.${string}\`>` over a 10k-member union on every `useT(ns)`, and overloaded `t.rich`.
- Fix: generate **per-namespace interfaces** (`TongueRegister['ns']['home']['inbox']`) so `useT('home')` indexes instead of filtering a union. Avoid conditional types over the full key union. Measure with `tsc --extendedDiagnostics` and `--generateTrace` (https://github.com/microsoft/TypeScript/wiki/Performance).
- The `< 2 s for 10k keys` criterion in v0.1 is fine but under-specified. Define it as an *incremental* check of a file with 50 `t()` calls against a 10k-key registry, plus a cold `tsc --noEmit` delta versus no i18n. Also check editor completion latency (tsserver), which users notice more than CI time.
- Generated `.d.ts` that is stale until regeneration (ADR 0004) is the #1 DX complaint in codegen libraries. Generating at `next.config` load, via the watcher and in `tongue build`, plus a `postinstall`-free CI step, is right. Make "types missing" a clear error, not `any`.

### M7. ICU compilation: works with caveats
- Do not write a new ICU parser (issue #3). `@formatjs/icu-messageformat-parser` is the reference implementation, has locations, and is what the ROADMAP will diff against anyway (https://formatjs.github.io/docs/icu-messageformat-parser/). Owning only the codegen saves weeks and removes a whole class of parity bugs.
- Codegen to JS functions is straightforward for argument/select/plural/selectordinal/tags. Plural needs `Intl.PluralRules` (built in). Hoisted `Intl.NumberFormat`/`DateTimeFormat` instances should be **lazy** (created on first call), not module-level, or the "pure" annotation becomes a lie and module init costs grow with key count.
- Skeletons (`::currency/EUR`, date skeletons) are a long tail. Support a documented subset in v0.x, and fail the build on unsupported skeletons.
- `t.rich` producing ReactNodes is fine, but keys must be stable. Generate keys per tag index.

### M8. AI translate CLI: works
- Low technical risk: ICU validation, glossary, lockfile and BYO OpenAI-compatible endpoint are all sound (ADR 0005).
- It is **not a moat**. next-intl's ecosystem, Lingui and Paraglide/inlang all have AI/TMS adjacencies, and gt-next is built around AI translation. Treat it as a convenience and ship it late.
- Add placeholder protection: mask `{arg}` and tags before sending, and restore them after. Add max-cost/token budgeting and `--review` as the default in CI.

### M9. Codemods: risky
- `useTranslations('ns')` → `useT('ns')` is trivial. The hard part is server code. `getTranslations('ns')` takes no locale in next-intl and relies on `i18n/request.ts`. The codemod must find the nearest `params` in scope, thread `locale` through component props, and handle `generateMetadata`, actions and utilities. That is inter-procedural and will produce many TODOs on real apps.
- Fix: target "builds with TODO comments + a report", measure on 3 real OSS apps rather than the official example, and move codemods after v1.0 or limit them to a key/message-file migration plus `useTranslations` client mapping. The next-international codemod has a shrinking audience (no release since Oct 2024). Cut it.

---

## 2. Competitor scorecard (as of Oct 2026)

Legend: ✅ strong · ➖ comparable · ❌ weak/absent. next-tongue is **planned** only.

| Dimension | next-tongue (plan) | next-intl 4.8+ | Paraglide JS 2 | Lingui 5 | gt-next |
|---|---|---|---|---|---|
| Maturity / adoption | ❌ none | ✅ dominant | ✅ stable, multi-framework | ✅ mature | ➖ commercial-backed |
| Build-time ICU compile | ✅ planned | ➖ experimental `precompile` (~9 KB less JS, per https://next-intl.dev/blog/precompilation) | ✅ core design | ✅ compiled catalogs | ➖ compiler is experimental |
| Message-level client tree-shaking | ✅ planned (after redesign) | ❌ catalog/provider based | ✅ yes | ❌ per catalog | ❌ |
| Only active locale on client | ⚠️ unproven, may cost a waterfall | ✅ (per-locale catalog) | ❌ by default (functions hold locales) | ✅ per-locale catalogs | ✅ |
| Cache Components without headers | ✅ params-only | ➖ via root-params, caveats | ✅ documented on Next 16.4 | ➖ root-params example | ? unverified |
| Turbopack support for its compiler | ✅ goal | ✅ loader | ❌ Next guide says webpack plugin requires `--webpack` (https://paraglidejs.com/next-js) | ➖ SWC plugin, pinned to Next's swc_core | ❌ auto-injection webpack-only (https://generaltranslation.com/docs/react/nextjs/config) |
| Routing / proxy helpers | ✅ planned | ✅ | ➖ generic middleware + localizeUrl | ❌ BYO | ✅ |
| Typed keys + ICU args | ✅ | ✅ (opt-in arg types) | ✅ | n/a (source strings) | ❌ |
| Extraction / CI check | ✅ planned | ➖ `useExtracted` (experimental) | ➖ inlang tooling | ✅ | ✅ CLI |
| AI translation | ➖ BYO CLI | ❌ built in | ➖ ecosystem | ❌ | ✅ core product (service) |
| Bus factor | ❌ solo | ➖ mostly one maintainer | ➖ company-backed | ✅ team | ➖ company |

Where next-tongue can be genuinely better:
1. **A Turbopack-native compiler with message-level tree-shaking on Next 16.** Today Paraglide needs `--webpack` for its Next plugin, and gt-next's compiler is webpack-only. This is the single defensible technical gap. It is time-limited, so ship it first.
2. **A Next-specific, opinionated, no-headers-ever contract**, enforced by tests (no `headers()`, catalog absent from the RSC payload). next-intl can't make that guarantee without breaking its API.
3. **CI quality gates** (`tongue check` with GitHub annotations, CLDR plural validation, script-safe fallback). Unglamorous but real.

Only on par: params-only locale (Paraglide already does it), ICU precompilation (next-intl has it behind a flag), proxy routing (next-intl), typed args (next-intl and Paraglide), BYO-LLM translation (anyone can add it).

Worse: maturity, ecosystem and TMS integrations. It is also more verbose than root-params-based APIs, and Next-only where Paraglide/Lingui are portable. Migration cost from next-intl is high because of locale threading.

Can "faster / smaller / more reliable" be substantiated? Not today, and the README rightly claims no numbers. Benchmark protocol:
- **Fixture matrix:** {50, 1k, 10k} keys × {2, 10, 50} locales × {1, 20, 200} client components; one route using 2 keys, one using 200; a dynamic-keys page.
- **Competitors at their best config:** next-intl with `precompile: true` and the provider narrowed with `pick`; Paraglide 2 (webpack, its documented setup); Lingui with the SWC plugin; next-tongue.
- **Metrics:**
  - First-load JS per route (gzip + brotli) and RSC payload bytes, measured from `next build` output and the flight response;
  - Hydration timing on a throttled Moto G profile (Lighthouse/WebPageTest), including the message-chunk waterfall;
  - `next build` wall time and peak RSS; `next dev` cold start and HMR latency after a message edit;
  - `tsc --noEmit` cold/incremental and tsserver completion latency;
  - Proxy p50/p99 with `Accept-Language` variety at 2/50/150 locales;
  - SSR render time per 1,000 `t()` calls.
- **Rules:** a public repo, pinned versions, results in CI, competitor maintainers invited to tune their configs. Report losses as well as wins.

---

## 3. Performance expectations

| Area | Expectation | Notes |
|---|---|---|
| Runtime (server) | ≈ next-intl precompiled ≈ Paraglide | Function calls versus interpreted AST is a microsecond-level difference. It is not a user-visible win on server render. Do not market it. |
| Runtime (client) | Small win | No parser shipped. next-intl precompile already removes most parser cost (~9 KB). |
| Client bundle | Real win **only** if message-level shaking works and per-locale strategy is right | Expected win versus next-intl with a naive provider is large. Versus next-intl with `pick` narrowing it is modest. Versus Paraglide it comes from locale splitting vs. all-locales-per-key, and only above some locale count. |
| Build time | Codegen O(keys × locales) adds seconds | At 10k × 50 = 500k functions, emit per-namespace files, not per-key files on disk (FS pressure). Per-key granularity can be done with exports inside per-namespace modules, at a tree-shaking quality cost in dev. Cache by content hash. Turbopack persistent caching helps if outputs are stable. |
| Proxy | < 1 ms p50 at 150 locales plausible | Precompute, LRU on the header string. No `Intl` per request. |
| Type-check 10k keys | OK with per-namespace interfaces | Risk is in generics over the global union. Budget a ≤ 15% tsc delta, not an absolute 2 s. |
| Dev memory | Main risk | Watcher plus codegen inside `next.config` across workers. #23 is correct to make it an acceptance criterion. |

---

## 4. Top 5 risks and mitigations

1. **Turbopack's extension surface (high likelihood, high impact).** The core feature depends on a loader-only API that Next documents as a "core subset", with no plugin API.
   Mitigation:
   - Redesign M2 to need per-file transforms only.
   - Make codegen a standalone CLI step.
   - Use package.json `imports` instead of aliases where possible.
   - Run a CI matrix against `next@latest` and `next@canary` nightly.
   - Pin a supported range.
2. **Hydration waterfall / Suspense UX from per-locale client chunks (high, high).** This could make pages *slower* while making bundles smaller.
   Mitigation:
   - Default to server-translated strings.
   - For client keys, default to all-locales inline below a measured threshold.
   - Make per-locale splitting opt-in with documented trade-offs.
   - Add a Lighthouse regression gate.
3. **Competitors close the gap before v0.2 (high, high).** next-intl's `precompile` + `useExtracted` loader is one step from message-level splitting. Paraglide could ship a Turbopack loader.
   Mitigation:
   - Reorder so the Turbopack compiler + client shaking + benchmarks ship first, as a usable alpha within months.
   - Consider contributing upstream or offering a Paraglide-compatible output if the race is lost.
4. **Solo maintainer burden (certain, high).** The surface is compiler + types + routing + navigation + metadata + CLI + LLM + codemods + docs, and Next ships minors roughly every 6–8 weeks.
   Mitigation:
   - Cut scope (section 5).
   - Reuse FormatJS parser, `@formatjs/intl-localematcher` (or a precomputed table) and CLDR data.
   - Keep navigation thin by wrapping `next/link`.
   - Publish a support policy: latest Next minor only.
5. **DX verbosity and analysis false negatives (medium, high).** `locale` everywhere plus "your key wasn't detected" bugs will drive users back to next-intl.
   Mitigation:
   - `createTranslator(locale)` helpers and typed `LocaleProps`.
   - Root-params opt-in (#24) once upstream bugs close.
   - A loader escape analysis that falls back to the whole namespace with a warning, never silently dropping a key.
   - A dev-mode runtime check that throws on a missing compiled key with the file:line.

---

## 5. Concrete plan changes

### ADR edits
- **ADR 0001**: fix the Decision, which currently says "client call sites are rewritten to import from these modules" with per-route chunks. Replace it with "codegen before bundling plus a per-file call-site loader. No bundler plugin APIs. Granularity = per key. Locale strategy = inline-all below threshold, opt-in split." Add the Turbopack loader limits link as context.
- **New ADR 0009, "Client message delivery strategy"**: server-translated strings as the primary pattern; per-key imports; locale split threshold; Suspense contract; dynamic keys require a declared set (no type-based inference).
- **New ADR 0010, "Reuse FormatJS ICU parser"**: own only codegen and validation. Supersedes issue #3's parser work.
- **New ADR 0011, "Supported Next versions"**: latest 16.x minor plus canary CI. Turbopack is primary, webpack best-effort.
- **ADR 0004**: specify per-namespace generated interfaces and a tsc budget relative to baseline.
- **ADR 0002**: add server-action locale passing (`bind`) and outside-`[locale]` behaviour.

### Roadmap reorder (win early)
- **v0.1, "Prove the differentiator"** (merges the old v0.1 core with part of v0.2):
  - Config, codegen with FormatJS parser, types, `getT`, `TongueProvider`/`useT`;
  - Turbopack + webpack call-site loader;
  - the `examples/cache-components` app;
  - the **bundle benchmark vs next-intl (precompile) and Paraglide**, published.
  - If the benchmark doesn't show a clear win, stop and reconsider before building the rest.
- **v0.2**: `createProxy` (always/as-needed), `Link`/`redirect`/`usePathname`, `generateAlternates`, static export example.
- **v0.3**: `tongue check` (+ GitHub reporter) and `extract`. `check` is cheap, high-value and reuses the codegen AST.
- **v0.4**: localized `pathnames`, domains, `prefix: 'never'`, monorepo (#21).
- **v0.5**: `tongue translate`.
- **v0.9**: root-params opt-in decision (#24), API freeze.
- **Post-1.0**: next-intl codemod (client-side mapping + message files only before then). Drop the next-international codemod.

### Issue edits
- **#3**: retitle to "ICU codegen on top of @formatjs/icu-messageformat-parser". Keep the location/error-format criteria.
- **#4**: change "per-(locale, namespace) modules" to per-key exports. Make formatters lazy, not hoisted module-level instances.
- **#6**: add the per-namespace interfaces and a `--generateTrace` budget. Add a tsserver completion latency check.
- **#8**: change "plugin" to "config wrapper + codegen + loader". Add the criteria "no use of emitFile/loadModule/importModule" and "works with `next@canary` nightly". Add a multi-worker `next.config` singleton test.
- **#11**:
  - Replace "2 of 500 keys ship only those 2 for 1 locale" with "2 of 500 keys ship only those 2 (all locales ≤ threshold, or active locale with split mode)".
  - Add a hydration waterfall test (no extra round trip before interactivity in default mode).
  - Add escape-analysis fallback tests.
- **#7**: change `t.dynamic` to require a declared key set or namespace.
- **#15**: add an early check of `cacheComponents` + `output: 'export'`.
- **#18**: add an LRU and matcher-dot caveat docs.
- **#20**: keep as-is. It is the core promise.
- **New issue, "Benchmark harness vs next-intl/Paraglide/Lingui"**: v0.1, blocking.
- **New issue, "Server actions locale passing"** (docs + helper).
- **README comparison table**: update the Paraglide row. "Designed around Cache Components" for Paraglide should read "documented on Next 16.4 with Cache Components; webpack required for its plugin", not "not Next-specific". Add a gt-next column, and note next-intl `precompile` in the client row.

---

## 6. Positioning statement we can defend

> **next-tongue is a Next.js 16–only i18n library that compiles ICU messages ahead of time and works with Turbopack, the default bundler. Client components ship only the messages they actually call. The locale comes from route params, never from headers, so translated pages stay in the static shell under Cache Components. It is pre-alpha. Size and speed claims will be published only with reproducible benchmarks against next-intl (with precompile) and Paraglide.**

Do not claim, for now:
- "faster" at runtime;
- "zero runtime JSON" as a unique feature (Paraglide and precompiled next-intl overlap);
- "only the active locale on the client" (unproven, and it may trade against hydration latency);
- "first Cache Components-native library" (Paraglide documents it).

---

### Sources
- Turbopack config & loader limits: https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack
- proxy.ts: https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- Static exports (unsupported features): https://nextjs.org/docs/app/guides/static-exports
- use cache: https://nextjs.org/docs/app/api-reference/directives/use-cache
- next-intl precompile: https://next-intl.dev/blog/precompilation · https://next-intl.dev/docs/usage/plugin · https://github.com/amannn/next-intl/blob/main/rfcs/002-icu-message-precompilation.md
- next-intl useExtracted: https://next-intl.dev/docs/usage/extraction
- Paraglide Next.js guide (Next 16.4, `--webpack`): https://paraglidejs.com/next-js · https://github.com/opral/paraglide-js
- Paraglide-next adapter deprecated: https://registry.npmjs.org/@inlang/paraglide-next
- gt-next compiler config (webpack-only injection): https://generaltranslation.com/docs/react/nextjs/config
- FormatJS ICU parser: https://formatjs.github.io/docs/icu-messageformat-parser/
- TypeScript performance tracing: https://github.com/microsoft/TypeScript/wiki/Performance
- Upstream issues cited by the plan (not re-verified here): vercel/next.js#96756, #98493; amannn/next-intl#1493, #2412, #2060, #2136
