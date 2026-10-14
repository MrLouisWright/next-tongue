# 0009. Client message delivery strategy

- Status: Accepted
- Date: 2026-10-14

## Context
Per-route tree-shaking with "only the active locale" on the client cannot be built with Turbopack's per-file loaders ([ADR 0001](0001-compile-messages-at-build-time.md), [review M2](../review.md)). Per-locale chunks loaded with `use(load(...))` would also add a network waterfall on hydration: the client chunk loads, then the message chunk is requested, and every `useT` boundary suspends. Static key analysis without type information cannot infer finite unions such as `` t(`status.${status}`) ``.

## Decision
1. **Primary pattern: translate on the server and pass strings.** Server Components call `getT(locale, ns)` and pass rendered strings or ReactNodes to client components as props. Client components send no message code. Docs lead with this pattern.
2. **Client `t()` calls import per-key message modules.** The call-site loader rewrites `t('inbox', args)` in a client file to a static import of the per-key export `#tongue/msg/home/inbox`. The bundler dedupes and tree-shakes per key across routes.
3. **Default: all locales inlined for used keys.** A per-key module holds every locale's variant and selects by the provider's locale. No extra request, no Suspense. This is the default below a published threshold of locales × used keys.
4. **Opt-in per-locale splitting (later).** `client.split: 'locale'` generates a `switch (locale)` of `import()`s. **Suspense contract:** each `useT` boundary may suspend on first render for a locale; SSR renders the active locale synchronously; preloading uses only public APIs. Shipped only after the benchmark ([#25](https://github.com/MrLouisWright/next-tongue/issues/25)) measures the crossover point.
5. **Dynamic keys must declare their possible keys.** `t.dynamic(key, { from: ['status.open', 'status.closed'] })` imports only those keys; `t.ns('status')` imports the generated per-namespace module. Undeclared non-literal keys are a build error (`TONGUE_E_DYNAMIC_KEY`). No type-based inference of template-literal keys.
6. **Escape analysis.** If `t` escapes the file (passed as a prop or argument, returned, stored in an object), the loader falls back to the whole namespace and warns with `file:line`. It never silently drops a key. A dev-mode runtime check throws on a missing compiled key with `file:line`.

## Consequences
- \+ No hydration waterfall in the default mode; works with per-file loaders only.
- \+ Server-translated strings cost zero client message bytes.
- − With many locales, inlined per-key modules ship N variants per used key. Mitigated by opt-in splitting once measured.
- − Dynamic keys need a declaration; slightly more verbose than type-inferred unions.

## Alternatives considered
- Per-route `(namespace, locale)` chunks: needs graph access (not available).
- Per-locale chunks by default: smaller bytes, but a waterfall and a Suspense point per `useT`.
- Type-checker-based key inference in the loader: too slow and not available per file.
