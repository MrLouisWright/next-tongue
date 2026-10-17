<div align="center">

# next-tongue

**Compiler-first, type-safe i18n for the Next.js 16 App Router. Works with Turbopack, keeps the locale in route params, zero dependencies beyond `next` and `react`.**

![status: beta 0.9](https://img.shields.io/badge/status-beta%200.9-yellow)
![license: MIT](https://img.shields.io/badge/license-MIT-blue)
![Next.js 16](https://img.shields.io/badge/Next.js-16-black)

</div>

> [!WARNING]
> **next-tongue is at v0.9 (API freeze) — first npm publish pending.** Install from git until `0.9.0` is on the registry ([releasing](docs/releasing.md)). Public surfaces are frozen per [API freeze](docs/api-freeze.md). Feedback welcome in [issues](https://github.com/MrLouisWright/next-tongue/issues) and the [ADRs](docs/adr).

## Why

Next.js 16 made Cache Components and Partial Prerendering (PPR) the way to build fast apps, and renamed middleware to `proxy.ts`. Existing i18n libraries were designed before that, and it shows:

- **next-intl** (~7M downloads/week) is excellent and mature, but reading the locale in cached/static scopes has been a long-running pain point ([amannn/next-intl#1493](https://github.com/amannn/next-intl/issues/1493), [#2412](https://github.com/amannn/next-intl/issues/2412)), as have `proxy.ts` locale routing ([#1362](https://github.com/amannn/next-intl/issues/1362)) and `dynamicParams = false` SSG ([#2060](https://github.com/amannn/next-intl/issues/2060)).
- **next-international** has had no release since October 2024.
- **next-intl 4.8+** has an experimental `messages.precompile` option that compiles ICU at build time (~9 KB less client JS, per its [blog](https://next-intl.dev/blog/precompilation)), but the client still receives catalogs through the provider.
- **Paraglide JS 2** proves the compiler approach (tree-shaken, typed message functions) and documents a Next.js 16 setup with a `[locale]` root layout, an explicit locale and Cache Components ([guide](https://paraglidejs.com/next-js)). Its Next plugin requires `--webpack`.

## Positioning

> next-tongue is a Next.js 16–only i18n library that compiles ICU messages ahead of time and works with Turbopack, the default bundler. Client components ship only the messages they actually call. The locale comes from route params, never from headers, so translated pages stay in the static shell under Cache Components. It is in beta (0.9). Size and speed claims ship with reproducible benchmarks against next-intl (with precompile) and Paraglide.

We make no claims about runtime speed or "only the active locale on the client" until the [v0.1 benchmark](https://github.com/MrLouisWright/next-tongue/issues/25) is published. See the [critical review](docs/review.md).

## Design principles

1. **Build time over run time.** If it can be parsed, validated, typed or tree-shaken at build time, it is. ([ADR 0001](docs/adr/0001-compile-messages-at-build-time.md))
2. **The locale is a route param.** Only `proxy.ts` touches headers and cookies, so every translated scope can be cached and prerendered. ([ADR 0002](docs/adr/0002-locale-from-params-only.md))
3. **Standards, not lock-in.** ICU MessageFormat, plain JSON files, any OpenAI-compatible model, MIT license.
4. **Next.js-native, nothing else.** Next.js 16+ App Router only, latest minor supported, with a nightly canary run. ([ADR 0006](docs/adr/0006-nextjs-16-only.md), [ADR 0011](docs/adr/0011-supported-next-versions.md))
5. **Zero dependencies.** Nothing beyond the `next` and `react` peers, at runtime, build time or in the CLI. ([ADR 0012](docs/adr/0012-zero-dependencies.md))

**Non-goals (v1):** Pages Router, Next.js ≤ 15, client-side runtime catalogs, a hosted translation service.

## Features (planned)

- **Zero dependencies beyond `next` and `react`** — own small ICU parser with a documented subset, Node built-ins only in the CLI, enforced by a CI dependency budget ([ADR 0012](docs/adr/0012-zero-dependencies.md)).
- **Compiled messages that work with Turbopack** — codegen before bundling plus a per-file call-site loader; no bundler plugin APIs ([ADR 0001](docs/adr/0001-compile-messages-at-build-time.md)).
- **Client components ship only the messages they call** — each `t()` call imports a per-key module. The recommended pattern is to translate on the server and pass strings, which ships no message code at all ([ADR 0009](docs/adr/0009-client-message-delivery.md)).
- **Params-only locale for Cache Components** — the locale always comes from route `params` (resolved by `proxy.ts`), never from `headers()`/`cookies()` inside cached scopes. Static shells, PPR and `output: 'export'` work.
- **Database and CMS messages** — async build-time `sources` in `tongue.config.ts` (compiled and typed like files), plus server-only `formatMessage(locale, icu, values)` for copy that changes without a rebuild ([Database messages](docs/database-messages.md), [ADR 0013](docs/adr/0013-database-and-cms-messages.md)).
- **Translator-friendly tooling** — `en-XA` pseudo-localisation, `tongue export`/`import` for XLIFF 2.0 and CSV, and a per-route report of keys and bytes sent to the client ([Dev tools](docs/dev-tools.md), [Translator workflow](docs/translator-workflow.md)).
- **Accessible headless `LocaleSwitcher`** — keeps the same page (localized pathnames), persists the choice, works without JS.
- **Typed `Intl` helpers** — lists, relative time, units and display names (`Intl.ListFormat`, `RelativeTimeFormat`, `DisplayNames`, unit formats).
- **Translator context and stale detection** — `$meta` comments, screenshot links and max-length limits fed into translate/export; `tongue check` flags translations whose source changed (hashes in `tongue.lock`).
- **Per-user preferred language** — a documented recipe now; a helper with a signed cookie and a `createProxy({ resolveLocale })` hook in v1.1, with no DB call in the proxy ([User preferences](docs/user-preferences.md)).
- **Security-hardened** — XSS tests for rich text and database strings, strict locale validation against path traversal and header injection, and a [threat model](SECURITY.md#threat-model).
- **VS Code extension (v1.1)** — inline previews, missing-key diagnostics, go-to-message, hover with all locales ([VS Code](docs/vscode.md)).
- **Dev overlay** — a dev-only panel with the current locale, missing keys and the messages sent to the client; click a string to jump to its key. Stripped from production.
- **Fully typed** — keys, namespaces and ICU arguments (`{count, plural, ...}` → `count: number`) are checked by TypeScript.
- **One API across the App Router** — server components, client components, server actions, `generateMetadata` with hreflang, translated OG images and emails, locale-aware `Link` / `redirect` / `useRouter`, and typed translated validation errors (`translateIssues`, schema-agnostic).
- **CLI (Node built-ins only)** — `tongue build`, `tongue init`, `tongue extract`, `tongue check` (CI gate for missing / unused / mismatched keys, plus `lang`/`dir` and bidi checks) and `tongue translate` (bring your own LLM key via any OpenAI-compatible endpoint, with glossary and lockfile).
- **Hydration-safe dates** — an explicit `timeZone` in config (default `'UTC'`). The server's default zone is never used, and per-user zones are scoped to dynamic boundaries ([ADR 0008](docs/adr/0008-explicit-time-zone.md)).
- **Fast proxy at any locale count** — locale matching tables are precomputed at build time; the target is < 1 ms p50 with 150 locales.
- **Monorepo-ready** — shared message packages in pnpm workspaces, with portable generated types.
- **Migration from next-intl** — a guide now; a codemod after v1.0.

## Quick start (planned API)

```bash
npm install next-tongue        # 0.9.0 — publish pending; until then: git+https://github.com/MrLouisWright/next-tongue.git
npx tongue init
```

```ts
// tongue.config.ts
import { defineConfig } from 'next-tongue/config';

export default defineConfig({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  messages: './messages/{locale}.json',
});
```

```ts
// next.config.ts
import { withTongue } from 'next-tongue/next'; // config wrapper: runs codegen, registers the call-site loader
export default withTongue({ cacheComponents: true });
```

```ts
// proxy.ts
import { createProxy } from 'next-tongue/proxy';
export const proxy = createProxy();
export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] };
// Note: this matcher skips every path containing a dot (e.g. /de/blog/v1.2). See Routing & proxy.
```

```json
// messages/en.json
{ "home": { "title": "Welcome, {name}!", "inbox": "{count, plural, =0 {No messages} one {# message} other {# messages}}" } }
```

```tsx
// app/[locale]/layout.tsx (excerpt)
import { localeParams } from 'next-tongue/server';
export const generateStaticParams = localeParams; // keeps the shell static under cacheComponents
```

```tsx
// app/[locale]/page.tsx
import { getT } from 'next-tongue/server';

export default async function Page({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  const t = await getT(locale, 'home');
  return <h1>{t('title', { name: 'Ada' })}</h1>; // t('titel') or a missing `name` is a type error
}
```

```tsx
// app/[locale]/inbox-badge.tsx
'use client';
import { useT } from 'next-tongue/client';

export function InboxBadge({ count }: { count: number }) {
  const t = useT('home');
  return <span>{t('inbox', { count })}</span>;
}
```

See [Getting started](docs/getting-started.md) for the full walkthrough.

## Comparison

Honest, feature-level comparison as of October 2026. next-tongue's column is **planned**, not shipped. No performance numbers are claimed; benchmarks will be published with reproducible scripts once code exists.

| | next-tongue (planned) | next-intl | Paraglide JS 2 | gt-next | next-international | Lingui |
|---|---|---|---|---|---|---|
| Status | beta 0.9 | mature, very active | stable, active | active, company-backed | unmaintained since Oct 2024 | mature, active |
| Approach | build-time compiler (codegen + per-file loader) | runtime catalogs; experimental `messages.precompile` compiles ICU at build time | build-time compiler | runtime + AI translation service; experimental compiler | runtime catalogs | macros + compiled catalogs |
| Works with Turbopack (its compiler) | goal | yes (loader) | Next plugin requires `--webpack` | auto-injection is webpack-only ([docs](https://generaltranslation.com/docs/react/nextjs/config)) | n/a | SWC plugin, pinned to Next's `swc_core` |
| Next.js App Router routing helpers | yes (`proxy.ts`, Link, redirect) | yes | generic middleware + `localizeUrl` | yes | yes | no (bring your own) |
| Cache Components / params-only locale | yes (params-only locale) | supported with caveats, via root params (see #1493) | documented on Next 16.4 with Cache Components | unverified | no | root-params example |
| Client gets only the messages it calls | yes, per key (all locales of used keys by default) | no — provider passes catalogs (narrow with `pick`); `precompile` removes the parser, not unused messages | yes, per message (all locales by default) | no | partial (per-locale import) | per catalog |
| Typed keys | yes | yes | yes (functions) | no | yes | n/a (source strings / macro IDs) |
| Typed ICU arguments | yes | opt-in (v4, via generated declarations) | yes | no | params typed, no ICU | n/a (args come from JS template literals) |
| Message format | ICU MessageFormat (documented subset) | ICU MessageFormat | inlang message format (plugins incl. ICU) | ICU / JSX | custom interpolation | ICU (PO / JSON) |
| Extraction / CI check CLI | yes (`extract`, `check`) | experimental `useExtracted` (v4.5+); no built-in CI check | via inlang tooling | yes (CLI) | no | yes (`lingui extract`) |
| AI translation | BYO key CLI | no (separate products) | via inlang ecosystem | core product (service) | no | no |
| Migration from next-intl | guide; codemod after v1.0 | — | no | no | — | no |
| Uses `next/root-params` for implicit locale | not by default ([ADR 0007](docs/adr/0007-root-params-not-default.md)); explicit `locale` arg | required for Cache Components support ([#1493](https://github.com/amannn/next-intl/issues/1493)) | no (explicit locale) | unverified | no | yes, in example/docs on Next 16.3+ ([lingui#2645](https://github.com/lingui/js-lingui/issues/2645)) |

Sources: each project's public docs and issue tracker, checked October 2026; see the [critical review](docs/review.md) for links. Corrections welcome — open an issue if any cell is wrong.

## Documentation

Also available as a [GitHub wiki](https://github.com/MrLouisWright/next-tongue/wiki) (same content as `docs/`).

| Guides | Reference |
|---|---|
| [Getting started](docs/getting-started.md) | [API reference](docs/api-reference.md) |
| [Configuration](docs/configuration.md) | [CLI](docs/cli.md) |
| [Routing & proxy](docs/routing-and-proxy.md) | [Architecture: how the compiler works](docs/architecture.md) |
| [Server components](docs/server-components.md) | [Architecture Decision Records](docs/adr/README.md) |
| [Client components](docs/client-components.md) | [FAQ](docs/faq.md) |
| [Server actions](docs/server-actions.md) | [Troubleshooting](docs/troubleshooting.md) |
| [ICU messages](docs/icu-messages.md) | [Migration from next-intl](docs/migration/next-intl.md) |
| [Type safety](docs/type-safety.md) | [Migration from next-international](docs/migration/next-international.md) |
| [Cache Components & PPR](docs/cache-components.md) | [Testing](docs/testing.md) |
| [Static export](docs/static-export.md) | [AI translation](docs/ai-translation.md) |
| [Metadata, SEO & hreflang](docs/metadata-seo.md) | [Docs index](docs/README.md) |
| [Database & CMS messages](docs/database-messages.md) | [Dev tools](docs/dev-tools.md) |
| [Translator workflow (XLIFF/CSV)](docs/translator-workflow.md) | [VS Code extension](docs/vscode.md) |
| [Per-user preferred language](docs/user-preferences.md) | [Security & threat model](SECURITY.md) |
| [Research: i18n pain points 2025–2026](docs/research.md) | [Critical review (Oct 2026)](docs/review.md) |

## Roadmap

| Milestone | Theme |
|---|---|
| v0.1 | **Prove the differentiator:** own ICU parser + codegen, types, `getT`/`useT`, call-site loader, Cache Components example, published bundle benchmark vs next-intl (precompile) and Paraglide — go/no-go gate |
| v0.2 | `proxy.ts` (`always`/`as-needed`), navigation, metadata, static export, server `formatMessage`, pseudo-localisation, `Intl` helpers, security hardening |
| v0.3 | CLI `check`/`extract`/`init`, dev overlay, `LocaleSwitcher`, translated validation errors, OG images and emails |
| v0.4 | Localized pathnames, domains, `prefix: 'never'`, monorepo, build-time DB/CMS `sources`, XLIFF/CSV, translator context, stale detection, a11y/bidi checks, `tongue report` |
| v0.5 | `tongue translate` (BYO LLM, glossary, lockfile) |
| v0.9 | Beta: API freeze, root-params decision ([#24](https://github.com/MrLouisWright/next-tongue/issues/24)) |
| v1.0 | Stable, [semver / deprecation / support policy](docs/versioning.md) |
| v1.1 | VS Code extension, per-user preferred language helper |
| post-1.0 | next-intl codemod (next-international codemod dropped) |

Full detail with acceptance criteria: [ROADMAP.md](ROADMAP.md) · [Milestones](https://github.com/MrLouisWright/next-tongue/milestones) · [Project board](https://github.com/users/MrLouisWright/projects/7).

## Support policy

From v1.0: [Semantic Versioning](https://semver.org/), documented deprecations before removal, and Next.js support as in [ADR 0011](docs/adr/0011-supported-next-versions.md) — **latest Next 16.x** + React ≥ 19.2 (App Router). Details: [Versioning](docs/versioning.md).

## Contributing

Design feedback is the most valuable contribution right now. Read [CONTRIBUTING.md](CONTRIBUTING.md), pick an issue labelled [`good first issue`](https://github.com/MrLouisWright/next-tongue/labels/good%20first%20issue) or comment on an [ADR](docs/adr/README.md). Please follow the [Code of Conduct](CODE_OF_CONDUCT.md); report vulnerabilities per [SECURITY.md](SECURITY.md).

## Support

If this project is useful to you, you can support its development with a donation: [Buy me a coffee](https://donate.stripe.com/aFa00lek3cvX4Ds2Fk9EI0b). It helps keep these tools maintained, documented and free for everyone.

## License

MIT © Louis Wright ([Louis Wright](https://github.com/MrLouisWright))
