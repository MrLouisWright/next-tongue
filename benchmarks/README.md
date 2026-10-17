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

## Scenarios

**Baseline — 2 of 500 keys × 3 locales**, esbuild minify + gzip (client message code only):

| Library | What it models |
|---|---|
| `next-tongue` | Per-key modules from real codegen |
| `runtime-catalog-pick-2-keys` | next-intl best case: provider narrowed to 2 keys |
| `paraglide-style-per-message` | Paraglide-like per-message functions, all locales of used keys |

**Matrix** (`results/matrix.json`): keys ∈ {50, 1000} × locales ∈ {2, 10, 50} × used ∈ {2, 20}.

**SSR** (`results/ssr.json`): 1,000 compiled `t()`-equivalent calls after warm-up.

**Real next-intl app** (`apps/next-intl`): Next 16 + `precompile` + 2-of-500 narrowed catalog → `results/next-intl-app.json`.

Still open for the go/no-go gate: Paraglide Next + Lingui apps, hydration timing, build RSS, published ROADMAP decision.
