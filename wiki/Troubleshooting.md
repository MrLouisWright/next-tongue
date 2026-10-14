> 📄 Mirrors [`docs/troubleshooting.md`](https://github.com/MrLouisWright/next-tongue/blob/main/docs/troubleshooting.md) in the main repo — the repo version is canonical.

# Troubleshooting

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](Roadmap).

| Symptom | Cause | Fix |
|---|---|---|
| `Route "/[locale]" used headers() inside "use cache"` | Your code (not next-tongue) reads headers in a cached scope | Move the read into a Suspense'd dynamic component; get locale from params |
| Type error: `Argument of type 'string' is not assignable to parameter of type 'Locale'` | Raw `params.locale` passed to `getT` | `if (!isLocale(locale)) notFound();` |
| Keys not typed / `any` | `.tongue/types.d.ts` missing from tsconfig `include` or not generated | Run `npx tongue extract --types-only`; check `include` |
| `TONGUE_E_ICU_SYNTAX` at build | Invalid ICU in a message file | Error shows file:key:column; quote literal braces with `'{'` |
| `TONGUE_E_DYNAMIC_KEY` | `t(variable)` in strict mode | Use a literal-union key or `t.dynamic()` |
| Redirect loop | `matcher` also matches already-prefixed assets, or a host redirect fights `prefix` | Exclude `_next`, files, `api`; align host rules |
| 404 for `/` with `output: 'export'` | No proxy in static export | `tongue init --export` root page or host redirect |
| `TONGUE_E_NO_PROVIDER: useT must be used within TongueProvider` | Provider missing in layout | Add `TongueProvider` to `app/[locale]/layout.tsx` |
| Wrong locale after switching | Stale locale cookie | Switcher uses `<Link locale>`, which updates the cookie via proxy |

## Error codes (planned)

| Code | Raised by | Meaning |
|---|---|---|
| `TONGUE_E_CONFIG` | plugin, CLI | Invalid `tongue.config.ts` (message lists the field) |
| `TONGUE_E_ICU_SYNTAX` | compiler | ICU parse error |
| `TONGUE_E_MISMATCH` | compiler, `check` | Args/tags/plural categories differ from default locale |
| `TONGUE_E_MISSING` | compiler, `check` | Key missing in a locale (when `strict.missing: 'error'`) |
| `TONGUE_E_DYNAMIC_KEY` | compiler | Non-literal key without `t.dynamic` |
| `TONGUE_E_NO_PROVIDER` | client runtime | `useT`/`useLocale` outside `TongueProvider` |

Still stuck? Open an issue with the output of `npx tongue check --json` and your `tongue.config.ts`.

