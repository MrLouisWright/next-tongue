# Paraglide JS competitor fixture (#25)

Real `@inlang/paraglide-js` codegen for the same 500-key × 3-locale fixture, measuring an esbuild client entry that imports only `k0` and `k1`.

## Run

```bash
pnpm install
pnpm --filter @next-tongue/bench-paraglide run measure
```

Writes `benchmarks/results/paraglide-real.json` (full runtime + messages-only stub).
