# Bundle benchmarks (v0.1 go/no-go)

Tracked in [#25](https://github.com/MrLouisWright/next-tongue/issues/25).

Compares **client JS** for a fixture that uses 2 of 500 message keys across next-tongue, next-intl (with `messages.precompile` + `pick` where applicable), and Paraglide.

## Run

```bash
pnpm install
pnpm --filter next-tongue run build
pnpm benchmark   # tongue + catalog-pick proxy + paraglide-style + summary
```

Results land in `benchmarks/results/` as JSON (`summary.json` ranks by gzip).

## Current scenario

**2 of 500 keys × 3 locales**, esbuild minify + gzip (client message code only):

| Library | What it models |
|---|---|
| `next-tongue` | Per-key modules from real codegen |
| `runtime-catalog-pick-2-keys` | next-intl best case: provider narrowed to 2 keys |
| `paraglide-style-per-message` | Paraglide-like per-message functions, all locales of used keys |

Full competitor apps (next-intl precompile, Paraglide Next `--webpack`, Lingui SWC) and the matrix in #25 still to come.
