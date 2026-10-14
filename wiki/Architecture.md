> 📄 Mirrors [`docs/architecture.md`](https://github.com/MrLouisWright/next-tongue/blob/main/docs/architecture.md) in the main repo — the repo version is canonical.

# Architecture: how the compiler works

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](Roadmap).

next-tongue is **a config wrapper + codegen + a per-file call-site loader**. It uses no bundler plugin APIs, because Turbopack (the Next.js 16 default) exposes only per-file webpack loaders: no `emitFile`, `loadModule`, `importModule` or module-graph access ([Next.js docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack), [ADR 0001](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0001-compile-messages-at-build-time.md)). It has zero dependencies beyond `next` and `react` ([ADR 0012](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0012-zero-dependencies.md)).

```
messages/*.json ─┐
sources (DB/CMS) ┴► own ICU parser ──► validate (CLDR plurals via Intl, args vs default locale)
                          │
     tongue build  ───────┼──► .tongue/types.d.ts          (per-namespace TongueRegister)
  or withTongue at        ├──► .tongue/msg/{ns}/{key}.js    (per-key export, all locales inlined)
  next.config load        ├──► .tongue/ns/{ns}.js           (whole namespace: server, t.ns, fallback)
                          └──► .tongue/manifest.json        (keys, hashes, locales, proxy tables)

client file ──► per-file loader (turbopack.rules / webpack) ──► t('inbox') → import { inbox } from '#tongue/msg/home/inbox'
```

## 1. Codegen (before bundling)
`tongue build` is the source of truth; `withTongue` in `next.config.ts` runs the same codegen synchronously and idempotently (content-hash keyed) when Next loads its config, so tsc, Vitest and CI work without Next. In dev an `fs.watch` watcher (one per project, guarded by a lockfile, since `next.config` may be evaluated by several workers) rewrites `.tongue/*`, and Turbopack's own file watching triggers HMR. `#tongue/*` resolves through package.json `imports`, with `turbopack.resolveAlias` as a fallback.

Messages are parsed by next-tongue's own ICU parser ([ADR 0010](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0010-own-icu-parser.md)). Each message becomes a pure function (or a string constant when it has no args). `Intl` formatters are created **lazily** on first call, never as module-level instances, so modules are side-effect free and tree-shake cleanly. Fallback chains are resolved here, so the runtime never "looks up" a key. At large key × locale counts, per-key exports are grouped inside per-namespace files on disk to limit file-system pressure.

## 2. Client delivery ([ADR 0009](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0009-client-message-delivery.md))
- **Primary pattern:** translate in a Server Component with `getT` and pass strings as props. No message code reaches the client.
- **Client `t()` calls:** the loader (a pure function of one file's source, using a small built-in scanner) rewrites
  ```tsx
  const t = useT('home'); t('inbox', { count })
  ```
  into a static import of a per-key module that holds every locale's variant and selects by the provider's locale:
  ```tsx
  import { inbox } from '#tongue/msg/home/inbox';
  inbox(locale, { count })
  ```
  The bundler dedupes and tree-shakes per key across routes. No extra request and no Suspense in the default mode.
- **Locale granularity:** all locales of a used key are inlined below a threshold published by the benchmark ([#25](https://github.com/MrLouisWright/next-tongue/issues/25)). Per-locale splitting (`switch (locale)` of `import()`s, with a Suspense contract) is opt-in later.
- **Dynamic keys** must declare their set: `t.dynamic(key, { from: [...] })` or `t.ns('status')`. No type-based inference.
- **Escape analysis:** if `t` escapes the file (prop, argument, return, object), the loader imports the whole namespace and warns with `file:line`. It never drops a key silently.

On the server, `getT` imports the namespace module (server bundles are not shipped to clients). `formatMessage` parses request-time strings with an LRU cache ([Database messages](Database-and-CMS-Messages)).

## 3. Type generation
From the default locale's AST: arg names and kinds (`plural` → `number`, `select` → literal union, tags → `RichTag`), written as **per-namespace interfaces** to `.tongue/types.d.ts` so `useT('home')` indexes rather than filtering a global key union ([ADR 0004](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0004-generated-types-registry.md)).

## 4. Integration points
- **Turbopack and webpack:** the same per-file loader via `turbopack.rules` (`condition: { all: [{ not: 'foreign' }, 'browser'] }`, content match on `useT(`) and webpack `module.rules`.
- **Proxy:** precomputed locale tables from the manifest; no message code in the proxy bundle.
- **Supported versions:** latest Next 16.x minor plus a nightly canary run ([ADR 0011](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0011-supported-next-versions.md)).

## Runtime size budget (target, not measured)
`next-tongue/client` runtime < 2 kB min+gz, excluding message functions. Enforced with `size-limit` in CI from v0.2.

## Open questions
Per-locale split threshold (measured in [#25](https://github.com/MrLouisWright/next-tongue/issues/25)); YAML support.
