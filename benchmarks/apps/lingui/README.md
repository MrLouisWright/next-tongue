# Lingui competitor fixture (#25)

Best-case Lingui client: `@lingui/core` with a catalog **narrowed to 2 of 500 keys** across 3 locales (analogous to next-intl `pick`).

## Run

```bash
pnpm install
pnpm --filter @next-tongue/bench-lingui run measure
```

Writes `benchmarks/results/lingui.json`.
