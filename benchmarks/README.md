# Bundle benchmarks (v0.1 go/no-go)

Tracked in [#25](https://github.com/MrLouisWright/next-tongue/issues/25).

Compares **client JS** for a fixture that uses 2 of 500 message keys across next-tongue, next-intl (with `messages.precompile` + `pick` where applicable), and Paraglide.

## Run

```bash
pnpm install
pnpm --filter next-tongue run build
pnpm --filter @next-tongue/benchmarks run measure
```

Results land in `benchmarks/results/` as JSON. Numbers are only published once scripts are stable and CI-reproducible.

## Status

Harness scaffold only — competitor fixtures and size measurement land next.
