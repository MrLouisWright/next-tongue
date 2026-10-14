# 0006. Support Next.js 16+ App Router only

- Status: Accepted
- Date: 2026-10-14

## Context
Next.js 16 introduced `proxy.ts` and stable Cache Components, and Turbopack is the default bundler. Supporting older versions and the Pages Router multiplies integration surface.

## Decision
Peer dependency `next@>=16`, `react@>=19.2`. App Router only. No other dependencies ([ADR 0012](0012-zero-dependencies.md)). Supported minors and canary CI: [ADR 0011](0011-supported-next-versions.md).

## Consequences
- \+ Small, focused surface; no legacy middleware code paths.
- − Users on Next 15 must upgrade first.
