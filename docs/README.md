# next-tongue documentation

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

## Guides
1. [Getting started](getting-started.md)
2. [Configuration](configuration.md)
3. [Routing & proxy](routing-and-proxy.md)
4. [Server components](server-components.md)
5. [Client components](client-components.md)
6. [Server actions](server-actions.md)
7. [ICU messages](icu-messages.md)
8. [Type safety](type-safety.md)
9. [Cache Components & PPR](cache-components.md)
10. [Static export](static-export.md)
11. [Metadata, SEO & hreflang](metadata-seo.md)
12. [CLI](cli.md)
13. [AI translation](ai-translation.md)
14. [Testing](testing.md)
15. Migration: [from next-intl](migration/next-intl.md) · [from next-international](migration/next-international.md)

## Reference
- [API reference](api-reference.md)
- [Architecture: how the compiler works](architecture.md)
- [Architecture Decision Records](adr/README.md)
- [FAQ](faq.md)
- [Troubleshooting](troubleshooting.md)
- [Research: i18n pain points 2025–2026](research.md)

## Package entry points (planned)

| Import | Runs in | Purpose |
|---|---|---|
| `next-tongue/config` | Node (build) | `defineConfig` |
| `next-tongue/plugin` | Node (build) | `withTongue` Next.js plugin |
| `next-tongue/proxy` | proxy (Node runtime) | `createProxy` |
| `next-tongue/server` | Server Components, actions, route handlers | `getT`, `getFormat`, `localeParams`, `generateAlternates`, `isLocale` |
| `next-tongue/client` | Client Components | `TongueProvider`, `useT`, `useFormat`, `useLocale` |
| `next-tongue/navigation` | both | `Link`, `redirect`, `permanentRedirect`, `useRouter`, `usePathname`, `getPathname` |
| `next-tongue/testing` | tests | `createTestT`, `TongueTestProvider` |
| `tongue` (bin) | CLI | `init`, `extract`, `check`, `translate`, `migrate` |
