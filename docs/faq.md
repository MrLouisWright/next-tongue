# FAQ

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

**Is this usable today?** No. It is pre-alpha with no published code. Follow the [roadmap](../ROADMAP.md).

**Why not just contribute to next-intl?** next-intl is great and mature. next-tongue explores a different core trade-off — build-time compilation and params-only locale — which would be a breaking redesign there. Migration codemods are planned so you can try it cheaply.

**Why not Paraglide?** Paraglide pioneered compiled, tree-shaken messages. next-tongue applies that idea with Next.js-specific pieces built in: `proxy.ts` routing, `[locale]` params, metadata/hreflang, Cache Components rules, codemods.

**Can I get the locale without passing it around?** In client components, `useLocale()`. In server components, from `params` or a prop. There is intentionally no header-reading `getLocale()` ([ADR 0002](adr/0002-locale-from-params-only.md)).

**Pages Router?** Not supported.

**Does it require Cache Components?** No. It works with or without `cacheComponents: true`; it just never breaks it.

**Can I load messages from a CMS at runtime?** Not in v1 — messages must exist at build time. Fetch CMS content as data and render it; use next-tongue for UI strings.

**Does `tongue translate` send my code to an LLM?** No — only message text, descriptions, glossary and context. See [AI translation](ai-translation.md).

**License?** MIT.
