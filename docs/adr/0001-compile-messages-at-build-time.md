# 0001. Compile messages at build time (codegen + per-file call-site loader)

- Status: Accepted (revised 2026-10-14 after the [critical review](../review.md), M1/M2)
- Date: 2026-10-14

## Context
Runtime i18n libraries ship a message parser/formatter and JSON catalogs; to limit client size users must manually pick which messages to pass to a provider. Paraglide showed compiled message functions tree-shake well, and next-intl 4.8+ has an experimental `precompile` option.

The first version of this ADR assumed a Turbopack "plugin" that could see the module graph and emit one chunk per `(namespace, locale)` per route. **Turbopack has no such API.** Its `turbopack` config exposes only `rules` (webpack loaders run via `loader-runner`), `resolveAlias`, `resolveExtensions`, `root` and `debugIds`. In loaders, `emitFile`, `loadModule` and `importModule` are unsupported, `fs` is limited to `readFile`, options must be plain JSON, and only loaders that return JavaScript are supported ([Next.js Turbopack config](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack)). There are no compiler hooks and no way to see other modules. Turbopack is the Next.js 16 default.

## Decision
1. **Codegen before bundling, no bundler plugin APIs.** Message compilation is a standalone step. `tongue build` (CLI) is the source of truth; `withTongue` in `next.config.ts` runs the same codegen synchronously and idempotently (content-hash keyed) when Next loads its config, and starts a dev watcher guarded by a lockfile/singleton (the config can be evaluated by several workers). Output goes to `.tongue/` (`.js` + `.d.ts`), resolved through package.json `imports` (`"#tongue/*"`), with `turbopack.resolveAlias`/webpack `resolve.alias` only as a fallback. This makes tsc, Vitest and CI work without Next.
2. **Per-file call-site loader.** A loader registered in `turbopack.rules` (and the webpack equivalent) rewrites `useT`/`t()` call sites in client files. It is a pure function of one file's source. It never uses `emitFile`, `loadModule`, `importModule` or graph access. Any design needing those is out of scope.
3. **Granularity = per key.** Each `t('key')` becomes a static import of a per-key export (`import { inbox } from '#tongue/msg/home/inbox'`), so the bundler dedupes and tree-shakes across routes. On disk, codegen may group per-key exports inside per-namespace files when key × locale counts are large (FS pressure).
4. **Locale strategy = inline all locales below a threshold; per-locale splitting is opt-in.** See [ADR 0009](0009-client-message-delivery.md).
5. ICU parsing uses next-tongue's own small parser with a documented subset ([ADR 0010](0010-own-icu-parser.md)), and the whole toolchain has zero dependencies ([ADR 0012](0012-zero-dependencies.md)). No parser and no JSON catalog ship to the browser.

## Consequences
- \+ Works within Turbopack's documented loader subset and under webpack with the same code path.
- \+ Client bundles contain only the message functions that client code calls; syntax errors fail the build.
- \+ Types are derived from the same AST.
- − By default a used key ships all its locales. "Only the active locale on the client" is **not** promised until measured ([ADR 0009](0009-client-message-delivery.md)).
- − A loader sees one file, so keys that escape static analysis (`t` passed around, computed keys) fall back to the whole namespace with a warning, or must be declared ([ADR 0009](0009-client-message-delivery.md)).
- − Must track Next.js releases; see [ADR 0011](0011-supported-next-versions.md).
- − Typed messages must exist at build time. Database/CMS messages come via build-time `sources` or server-only `formatMessage` ([ADR 0013](0013-database-and-cms-messages.md)); no client runtime catalogs.

## Alternatives considered
- A Turbopack plugin with graph access for per-route chunks: not possible with the public API.
- A webpack-only plugin: Next 16 defaults to Turbopack, and two divergent implementations would be needed.
- Runtime catalogs with a selective provider (next-intl model); precompiled JSON ASTs with a tiny runtime (FormatJS/next-intl precompile): smaller win, still ships catalogs.
