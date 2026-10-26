# ADR 0014: Hosted translation via Loomlocale (supersedes 0005)

- Status: accepted (1.0)
- Supersedes: [0005 BYO LLM (OpenAI-compatible)](0005-byo-llm-openai-compatible.md)

## Context
BYO keys meant every adopter re-solved prompt quality, retries, glossary enforcement, web review and billing. A hosted service lets us sync web edits, share glossaries and enforce placeholder rules server-side.

## Decision
`tongue translate/update` call only the Loomlocale API (base URL configurable). The CLI keeps client-side masking, parity, glossary and lockfile checks so a misbehaving server can never write broken ICU. Auth is OAuth device code; tokens live in the OS keychain via system CLIs (`security`, `secret-tool`) with a 0600 file fallback — no native or npm dependencies (ADR 0012 still holds; the TUI is hand-rolled on `readline`).

## Consequences
- 0.9.x remains the BYO-key line.
- The API contract is documented in [api-contract.md](../api-contract.md) and mocked in tests (`packages/next-tongue/scripts/mock-loomlocale.mjs`).
