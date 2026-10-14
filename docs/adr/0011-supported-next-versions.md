# 0011. Supported Next.js versions and canary CI

- Status: Accepted
- Date: 2026-10-14

## Context
The compiler depends on Turbopack's loader surface, which Next documents as a "core subset" with no plugin API ([ADR 0001](0001-compile-messages-at-build-time.md)). Next ships minors roughly every 6–8 weeks, and the project has one maintainer ([review §4](../review.md)).

## Decision
- **Supported:** the latest Next.js 16.x minor (peer range `next@^16.<latest minor>`, `react@>=19.2`), App Router only ([ADR 0006](0006-nextjs-16-only.md)). Older 16.x minors are best-effort.
- **Bundlers:** Turbopack is primary; webpack (`--webpack`) is best-effort but tested.
- **CI:** every PR runs against `next@latest`; a **nightly canary run** builds the examples and runs e2e against `next@canary` and reports breakage as an issue. A canary failure does not block PRs.
- The support policy is published in the README and updated with each Next minor.

## Consequences
- \+ Breakage from Next releases is found before users hit it.
- − Users on older 16.x minors may need to upgrade to get fixes.
