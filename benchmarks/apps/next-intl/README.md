# next-intl competitor fixture (#25)

Minimal Next 16 App Router app using **next-intl** with:

- `experimental.messages.precompile: true`
- Request config catalog **narrowed to 2 of 500 keys** (best-case `pick`)

## Run

```bash
pnpm install
pnpm --filter @next-tongue/bench-next-intl run measure
```

Writes `benchmarks/results/next-intl-app.json` (RSC/HTML + embedded messages snippet sizes).
