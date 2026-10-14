> 📄 Mirrors [`docs/faq.md`](https://github.com/MrLouisWright/next-tongue/blob/main/docs/faq.md) in the main repo — the repo version is canonical.

# FAQ

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](Roadmap).

**Is this usable today?** No. It is pre-alpha with no published code. Follow the [roadmap](Roadmap).

**Why not just contribute to next-intl?** next-intl is great and mature. next-tongue explores a different core trade-off — build-time compilation and params-only locale — which would be a breaking redesign there. Migration codemods are planned so you can try it cheaply.

**Why not Paraglide?** Paraglide pioneered compiled, tree-shaken messages. next-tongue applies that idea with Next.js-specific pieces built in: `proxy.ts` routing, `[locale]` params, metadata/hreflang, Cache Components rules, codemods.

**Can I get the locale without passing it around?** In client components, `useLocale()`. In server components, from `params` or a prop. There is intentionally no header-reading `getLocale()` ([ADR 0002](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0002-locale-from-params-only.md)).

**Pages Router?** Not supported.

**Does it require Cache Components?** No. It works with or without `cacheComponents: true`; it just never breaks it.

**Can I load messages from a CMS at runtime?** Not in v1 — messages must exist at build time. Fetch CMS content as data and render it; use next-tongue for UI strings.

**Does `tongue translate` send my code to an LLM?** No — only message text, descriptions, glossary and context. See [AI translation](AI-Translation).

**What are the known trade-offs?**
- You pass `locale` explicitly on the server (`getT(locale, ns)`), which is more verbose than an implicit request store.
- A build step is required; messages must exist at build time.
- Truly dynamic keys need `t.dynamic()` and cost bundle size.
- Next.js 16+ App Router only.

**Will there be benchmarks?** Yes, at v0.9, with reproducible scripts in the repo. Until then we make no performance claims beyond what follows from the design.

**License?** MIT.

