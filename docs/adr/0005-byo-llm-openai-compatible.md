# 0005. AI translation is BYO key, OpenAI-compatible, CLI-only

- Status: Accepted
- Date: 2026-10-14

## Context
Lingo.dev, gt-next and Tolgee bundle AI/workflow features as separate products or services. Many teams want a local, vendor-neutral step.

## Decision
`tongue translate` calls any OpenAI-compatible Chat Completions endpoint with a user-supplied key from an env var. It runs only in the CLI, never at build or request time. Glossary and a committed lockfile make results reproducible and reviewable; outputs are ICU-validated.

## Consequences
- \+ No service, no account, works with local models; zero runtime cost.
- − Quality depends on the chosen model; we provide prompts, validation and review flow, not guarantees.
