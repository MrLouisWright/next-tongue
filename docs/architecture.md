# Architecture: how the compiler works

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

```
messages/*.json ──► parse (ICU AST) ──► validate (CLDR plurals, args vs default locale)
                                   │
                                   ├──► .tongue/types.d.ts            (TongueRegister augmentation)
                                   ├──► .tongue/{locale}/{namespace}.js  (one exported fn per key)
                                   └──► .tongue/manifest.json          (keys, hashes, locales)

source files ──► fast AST scan (oxc parser, no Babel) ──► key usage graph per module
                                   │
client modules ──► transform: useT('ns') + t('key') ──► import { key } from '#tongue/{locale}/ns'
```

## 1. Message compilation
Each message becomes a pure function (or a string constant when it has no args). Plural/number/date formatters are hoisted per module and marked `/*#__PURE__*/`, so unused messages are dropped by the bundler's tree-shaking. Fallback chains are resolved at this step, so runtime never "looks up" a key.

## 2. Per-locale modules
For a client component, the transform turns
```tsx
const t = useT('home'); t('inbox', { count })
```
into code that selects a per-locale module for the provider's locale:
```tsx
import { load } from '#tongue/runtime';
const m = use(load('home', locale, ['inbox']));   // per-locale chunk, cached; Suspense-friendly
m.inbox({ count })
```
The bundler emits one chunk per `(namespace, locale)` containing only referenced keys. During SSR/prerender the active locale's chunk is preloaded, so no Suspense fallback flashes. On the server, `getT` imports the full namespace module (server bundles are not shipped to clients).

## 3. Type generation
From the default locale's AST: arg names and kinds (`plural` → `number`, `select` → literal union, tags → `RichTag`). Written to `.tongue/types.d.ts`.

## 4. Integration points
- **Turbopack and webpack** loaders via `withTongue` (Turbopack is the Next.js 16 default).
- **Dev**: file watcher recompiles on message change and triggers HMR for affected modules.
- **Proxy**: config subset inlined; no message code in the proxy bundle.

## Runtime size budget (target, not measured)
`next-tongue/client` runtime < 2 kB min+gz, excluding message functions. Will be enforced with `size-limit` in CI from v0.2.

## Open questions
Tracked as ADRs and issues: chunk granularity (per namespace vs per route), RSC-only messages passed as strings to client components, YAML support.

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
