# FAQ

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

**Is this usable today?** No. It is pre-alpha with no published code. Follow the [roadmap](../ROADMAP.md).

**Why not just contribute to next-intl?** next-intl is great and mature. next-tongue explores a different core trade-off — build-time compilation that works with Turbopack, message-level client tree-shaking, params-only locale and zero dependencies — which would be a breaking redesign there. A migration guide exists; a next-intl codemod is planned after v1.0.

**Why not Paraglide?** Paraglide pioneered compiled, tree-shaken messages and documents a Next.js 16 setup with Cache Components, but its Next plugin requires `--webpack`. next-tongue applies the compiler idea with a Turbopack-compatible loader and Next.js-specific pieces built in: `proxy.ts` routing, metadata/hreflang, `tongue check`.

**Can I get the locale without passing it around?** In client components, `useLocale()`. In server components, from `params` or a prop. There is intentionally no header-reading `getLocale()` ([ADR 0002](adr/0002-locale-from-params-only.md)).

**Pages Router?** Not supported.

**Does it require Cache Components?** No. It works with or without `cacheComponents: true`; it just never breaks it.

**Can I load messages from a database or CMS?** Yes, two ways: async build-time `sources` in `tongue.config.ts` (compiled and typed like files, need a rebuild to change), or the server-only `formatMessage(locale, icu, values)` for copy that changes at request time (untyped). No catalog is sent to the browser. See [Database messages](database-messages.md).

**Does `tongue translate` send my code to an LLM?** No — only message text, descriptions, glossary and context. See [AI translation](ai-translation.md).

**What are the known trade-offs?**
- You pass `locale` explicitly on the server (`getT(locale, ns)`), which is more verbose than an implicit request store.
- A codegen step is required; typed messages must exist at build time (request-time `formatMessage` is untyped).
- Dynamic keys must declare their possible keys: `t.dynamic(key, { from: [...] })` or `t.ns(ns)`.
- By default a used key ships all its locales to the client; per-locale splitting is opt-in later ([ADR 0009](adr/0009-client-message-delivery.md)).
- The ICU parser supports a documented subset ([ICU messages](icu-messages.md)).
- Next.js 16+ App Router only.

**Will there be benchmarks?** Yes, in v0.1: a published bundle benchmark against next-intl (with `precompile`) and Paraglide is the go/no-go gate ([#25](https://github.com/MrLouisWright/next-tongue/issues/25)). Until then we make no size or speed claims.

**Does next-tongue have dependencies?** No. Only `next` and `react` as peers ([ADR 0012](adr/0012-zero-dependencies.md)).

**Which Next.js versions?** The latest 16.x minor, tested nightly against canary ([ADR 0011](adr/0011-supported-next-versions.md)).

**License?** MIT.

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
