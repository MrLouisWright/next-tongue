# next-tongue documentation

> **Status: beta 0.9 (API freeze).** Public surfaces are frozen; see [API freeze](api-freeze.md) and [releasing](releasing.md). Additive APIs may still land before v1.0. See [ROADMAP](../ROADMAP.md).

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
12. [Database & CMS messages](database-messages.md)
13. [Dev tools: overlay, pseudo-localisation, usage report](dev-tools.md)
14. [Translator workflow: XLIFF, CSV and translator context](translator-workflow.md)
15. [Per-user preferred language](user-preferences.md)
16. [CLI](cli.md)
17. [AI translation](ai-translation.md)
18. [Testing](testing.md)
19. [VS Code extension (v1.1)](vscode.md)
20. Migration: [from next-intl](migration/next-intl.md) · [from next-international](migration/next-international.md) (deferred)
21. [Versioning, deprecation & support](versioning.md)
22. [API freeze (v0.9)](api-freeze.md)
23. [Releasing](releasing.md)
24. [Migrate OSS dry-run results (#31)](migrate-oss-results/README.md)
25. [Adopters & freeze verification](adopters.md)

## Reference
- [API reference](api-reference.md)
- [Architecture: how the compiler works](architecture.md)
- [Architecture Decision Records](adr/README.md)
- [FAQ](faq.md)
- [Troubleshooting](troubleshooting.md)
- [Research: i18n pain points 2025–2026](research.md)
- [Critical review (Oct 2026)](review.md)

## Package entry points (planned)

| Import | Runs in | Purpose |
|---|---|---|
| `next-tongue/config` | Node (build) | `defineConfig` |
| `next-tongue/next` | Node (build) | `withTongue` config wrapper: runs codegen, registers the per-file call-site loader |
| `next-tongue/proxy` | proxy (Node runtime) | `createProxy` |
| `next-tongue/server` | Server Components, actions, route handlers | `getT`, `getFormat`, `formatMessage`, `translateIssues`, `withLocale`, `localeParams`, `generateAlternates`, `isLocale` |
| `next-tongue/client` | Client Components | `TongueProvider`, `useT`, `useFormat`, `useLocale` |
| `next-tongue/navigation` | both | `Link`, `redirect`, `permanentRedirect`, `useRouter`, `usePathname`, `getPathname` |
| `next-tongue/testing` | tests | `createTestT`, `TongueTestProvider` |
| `tongue` (bin) | CLI (Node built-ins only) | `build`, `init`, `extract`, `check`, `translate`, `export`, `import`, `report` (`migrate` after v1.0) |

The package has **zero dependencies** beyond the `next` and `react` peers ([ADR 0012](adr/0012-zero-dependencies.md)).
