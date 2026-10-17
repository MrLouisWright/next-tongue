> 📄 Mirrors [`docs/adr/README.md`](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/README.md) in the main repo — the repo version is canonical.

# Architecture Decision Records

Format: [MADR](https://adr.github.io/madr/)-lite. Status values: Proposed · Accepted · Superseded. All ADRs are pre-release and may be revisited until v0.9 (API freeze). ADRs 0001, 0002 and 0004 were amended and 0009–0013 added after the [critical review](Critical-Review) (2026-10-14).

| # | Title | Status |
|---|---|---|
| [0001](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0001-compile-messages-at-build-time.md) | Compile messages at build time (codegen + per-file call-site loader) | Accepted |
| [0002](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0002-locale-from-params-only.md) | Locale comes from route params only | Accepted |
| [0003](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0003-icu-messageformat.md) | ICU MessageFormat as the only message syntax | Accepted |
| [0004](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0004-generated-types-registry.md) | Types via generated module augmentation | Accepted |
| [0005](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0005-byo-llm-openai-compatible.md) | AI translation is BYO key, OpenAI-compatible, CLI-only | Accepted |
| [0006](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0006-nextjs-16-only.md) | Support Next.js 16+ App Router only | Accepted |
| [0007](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0007-root-params-not-default.md) | `next/root-params` not default; opt-in `routing.rootParams` at v0.9 | Accepted |
| [0008](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0008-explicit-time-zone.md) | Time zone is explicit; never the server default | Accepted |
| [0009](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0009-client-message-delivery.md) | Client message delivery strategy | Accepted |
| [0010](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0010-own-icu-parser.md) | Own small ICU parser and compiler, with a documented subset | Accepted |
| [0011](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0011-supported-next-versions.md) | Supported Next.js versions and canary CI | Accepted |
| [0012](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0012-zero-dependencies.md) | Zero dependencies beyond `next` and `react` | Accepted |
| [0013](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0013-database-and-cms-messages.md) | Database and CMS messages | Accepted |

New ADR: copy [template.md](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/template.md), next number, open a PR labelled `type: adr`.
