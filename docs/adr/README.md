# Architecture Decision Records

Format: [MADR](https://adr.github.io/madr/)-lite. Status values: Proposed · Accepted · Superseded. All ADRs are pre-release and may be revisited until v0.9 (API freeze).

| # | Title | Status |
|---|---|---|
| [0001](0001-compile-messages-at-build-time.md) | Compile messages at build time | Accepted |
| [0002](0002-locale-from-params-only.md) | Locale comes from route params only | Accepted |
| [0003](0003-icu-messageformat.md) | ICU MessageFormat as the only message syntax | Accepted |
| [0004](0004-generated-types-registry.md) | Types via generated module augmentation | Accepted |
| [0005](0005-byo-llm-openai-compatible.md) | AI translation is BYO key, OpenAI-compatible, CLI-only | Accepted |
| [0006](0006-nextjs-16-only.md) | Support Next.js 16+ App Router only | Accepted |
| [0007](0007-root-params-not-default.md) | `next/root-params` is not a default locale source (revisit at v0.9) | Accepted |
| [0008](0008-explicit-time-zone.md) | Time zone is explicit; never the server default | Accepted |

New ADR: copy [template.md](template.md), next number, open a PR labelled `type: adr`.
