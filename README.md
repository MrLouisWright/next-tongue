<div align="center">

# next-tongue

**Compiler-first, type-safe i18n for the Next.js 16 App Router — built for Cache Components from day one.**

![status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-red)
![license: MIT](https://img.shields.io/badge/license-MIT-blue)
![Next.js 16](https://img.shields.io/badge/Next.js-16-black)

</div>

> [!WARNING]
> **next-tongue is pre-alpha and not published to npm.** Everything below describes the **planned** API. No library code exists yet; the design is open for feedback in [issues](https://github.com/MrLouisWright/next-tongue/issues) and the [ADRs](docs/adr).

## Why

Next.js 16 made Cache Components and Partial Prerendering (PPR) the way to build fast apps, and renamed middleware to `proxy.ts`. Existing i18n libraries were designed before that, and it shows:

- **next-intl** (~7M downloads/week) is excellent and mature, but reading the locale in cached/static scopes has been a long-running pain point ([amannn/next-intl#1493](https://github.com/amannn/next-intl/issues/1493), [#2412](https://github.com/amannn/next-intl/issues/2412)), as have `proxy.ts` locale routing ([#1362](https://github.com/amannn/next-intl/issues/1362)) and `dynamicParams = false` SSG ([#2060](https://github.com/amannn/next-intl/issues/2060)).
- **next-international** has had no release since October 2024.
- **Paraglide** proves the compiler approach (tree-shaken, typed message functions) but is framework-agnostic rather than Next-native.

next-tongue aims to combine the compiler approach with first-class Next.js 16 integration.

## Design principles

1. **Build time over run time.** If it can be parsed, validated, typed or tree-shaken at build time, it is. ([ADR 0001](docs/adr/0001-compile-messages-at-build-time.md))
2. **The locale is a route param.** Only `proxy.ts` touches headers and cookies, so every translated scope can be cached and prerendered. ([ADR 0002](docs/adr/0002-locale-from-params-only.md))
3. **Standards, not lock-in.** ICU MessageFormat, plain JSON files, any OpenAI-compatible model, MIT license.
4. **Next.js-native, nothing else.** Next.js 16+ App Router only, so the API can follow the framework closely. ([ADR 0006](docs/adr/0006-nextjs-16-only.md))

**Non-goals (v1):** Pages Router, Next.js ≤ 15, runtime-loaded catalogs from a CMS, a hosted translation service.

## Features (planned)

- **Zero runtime JSON on the client** — messages compile to tree-shaken, per-locale ES modules. A client component ships only the messages it uses, for the active locale.
- **Cache Components native** — the locale always comes from route `params` (resolved by `proxy.ts`), never from `headers()`/`cookies()` inside cached scopes. Static shells, PPR and `output: 'export'` work.
- **Fully typed** — keys, namespaces and ICU arguments (`{count, plural, ...}` → `count: number`) are checked by TypeScript.
- **One API across the App Router** — server components, client components, server actions, `generateMetadata` with hreflang, and locale-aware `Link` / `redirect` / `useRouter`.
- **CLI** — `tongue init`, `tongue extract`, `tongue check` (CI gate for missing / unused / mismatched keys) and `tongue translate` (bring your own LLM key via any OpenAI-compatible endpoint, with glossary and lockfile).
- **Migration codemods** from next-intl and next-international.

## Quick start (planned API)

```bash
npm install next-tongue        # not yet published
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
import { withTongue } from 'next-tongue/plugin';
export default withTongue({ cacheComponents: true });
```

```ts
// proxy.ts
import { createProxy } from 'next-tongue/proxy';
export const proxy = createProxy();
export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] };
```

```json
// messages/en.json
{ "home": { "title": "Welcome, {name}!", "inbox": "{count, plural, =0 {No messages} one {# message} other {# messages}}" } }
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

| | next-tongue (planned) | next-intl | Paraglide JS | next-international | Lingui |
|---|---|---|---|---|---|
| Status | pre-alpha | mature, very active | stable, active | unmaintained since Oct 2024 | mature, active |
| Approach | build-time compiler | runtime message catalogs (experimental `messages.precompile` option) | build-time compiler | runtime catalogs | macros + compiled catalogs |
| Next.js App Router routing helpers | yes (`proxy.ts`, Link, redirect) | yes | via generic/framework-agnostic setup | yes | no (bring your own) |
| Designed around Cache Components / PPR | yes (params-only locale) | supported with caveats (see #1493) | not Next-specific | no | not Next-specific |
| Client gets only used messages | yes, per locale | no — provider passes all messages by default (v4); can be narrowed manually | yes | partial (per-locale import) | per catalog |
| Typed keys | yes | yes | yes (functions) | yes | n/a (source strings / macro IDs) |
| Typed ICU arguments | yes | opt-in (v4, via generated declarations) | yes | params typed, no ICU | n/a (args come from JS template literals) |
| Message format | ICU MessageFormat | ICU MessageFormat | inlang message format (plugins incl. ICU) | custom interpolation | ICU (PO / JSON) |
| Extraction / CI check CLI | yes (`extract`, `check`) | experimental `useExtracted` (v4.5+); no built-in CI check | via inlang tooling | no | yes (`lingui extract`) |
| Built-in LLM translate (BYO key) | yes | no (separate products) | via inlang ecosystem | no | no |
| Codemods from next-intl / next-international | yes | — | no | — | no |

Sources: each project's public docs and issue tracker, checked October 2026. Corrections welcome — open an issue if any cell is wrong.

## Documentation

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

## Roadmap

| Milestone | Theme |
|---|---|
| v0.1 | Compiler core: config, ICU parser, per-locale modules, generated types |
| v0.2 | Next.js integration: plugin, `proxy.ts`, server/client APIs, navigation, metadata |
| v0.3 | CLI: `init`, `extract`, `check` |
| v0.4 | `tongue translate` (BYO LLM, glossary, lockfile) |
| v0.5 | Codemods from next-intl and next-international |
| v0.9 | Beta: API freeze, docs site, example apps, published benchmarks |
| v1.0 | Stable, semver guarantees |

Full detail with acceptance criteria: [ROADMAP.md](ROADMAP.md) · [Milestones](https://github.com/MrLouisWright/next-tongue/milestones).

## Contributing

Design feedback is the most valuable contribution right now. Read [CONTRIBUTING.md](CONTRIBUTING.md), pick an issue labelled [`good first issue`](https://github.com/MrLouisWright/next-tongue/labels/good%20first%20issue) or comment on an [ADR](docs/adr/README.md). Please follow the [Code of Conduct](CODE_OF_CONDUCT.md); report vulnerabilities per [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Louis Wright
