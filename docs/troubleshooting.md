# Troubleshooting

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

| Symptom | Cause | Fix |
|---|---|---|
| `Route "/[locale]" used headers() inside "use cache"` | Your code (not next-tongue) reads headers in a cached scope | Move the read into a Suspense'd dynamic component; get locale from params |
| Type error: `Argument of type 'string' is not assignable to parameter of type 'Locale'` | Raw `params.locale` passed to `getT` | `if (!isLocale(locale)) notFound();` |
| Keys not typed / `any` | `.tongue/types.d.ts` missing from tsconfig `include` or not generated | Run `npx tongue extract --types-only`; check `include` |
| `TONGUE_E_ICU_SYNTAX` at build | Invalid ICU in a message file | Error shows file:key:column; quote literal braces with `'{'` |
| `TONGUE_E_DYNAMIC_KEY` | `t(variable)` in strict mode | Use a literal-union key or `t.dynamic()` |
| Redirect loop | `matcher` also matches already-prefixed assets, or a host redirect fights `prefix` | Exclude `_next`, files, `api`; align host rules |
| 404 for `/` with `output: 'export'` | No proxy in static export | `tongue init --export` root page or host redirect |
| `useT must be used within TongueProvider` | Provider missing in layout | Add `TongueProvider` to `app/[locale]/layout.tsx` |
| Wrong locale after switching | Stale locale cookie | Switcher uses `<Link locale>`, which updates the cookie via proxy |

Still stuck? Open an issue with the output of `npx tongue check --json` and your `tongue.config.ts`.
