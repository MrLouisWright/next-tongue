# API freeze (v0.9)

> **Status: in effect for the public surface described below.** Additive APIs may still land in 0.x minors; removals and signature changes require a major after v1.0 ([Versioning](versioning.md)).

## Frozen surface

These entry points and shapes are treated as stable for beta adopters. Breaking changes need a deprecation cycle (or a major once we are at 1.0):

| Surface | Notes |
|---|---|
| `next-tongue/config` — `defineConfig` | Documented options in [Configuration](configuration.md) |
| `next-tongue/server` — `getT`, `getFormat`, `getDir`, `localeParams`, `withLocale`, `isLocale`, `setLocalePreference`, … | Explicit `getT(locale, ns)` remains canonical; `getT(ns)` only with `routing.rootParams` |
| `next-tongue/client` — `TongueProvider`, `useT`, `useFormat`, `useLocale` | |
| `next-tongue/proxy` — `createProxy`, `verifyLocalePreference` | |
| `next-tongue/navigation` — `createNavigation` | Client Module |
| `next-tongue/navigation/server` — `createNavigation` | Server Components; `Link` requires `locale` |
| `next-tongue/next` — `withTongue` | |
| CLI: `tongue build \| check \| extract \| init \| export \| import \| report \| translate \| migrate` | Flags documented in [CLI](cli.md) |

## Explicitly unfrozen

- Generated `.tongue/` file layout details (except that `#tongue/*` keeps working).
- Dev overlay UI and editor deep-link templates.
- Benchmark numbers (re-run anytime; not an API).
- VS Code Marketplace listing (extension code is in-repo; publish is separate).

## Adopter checklist

1. Pin `next-tongue@0.9.x` once published ([releasing](releasing.md)), or a git commit until then.
2. Run `tongue check` in CI.
3. Prefer explicit `getT(locale, ns)` unless you opt into `routing.rootParams`.
4. File issues against accidental breaks; they are treated as bugs during the freeze window.

---
[Docs index](README.md) · [Versioning](versioning.md) · [Roadmap](../ROADMAP.md)
