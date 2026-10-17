# Type safety

> **Status: beta 0.9 (API freeze).** Install `next-tongue` from npm. See [ROADMAP](../ROADMAP.md) and [API freeze](api-freeze.md).

Codegen emits `.tongue/types.d.ts`, which augments a registry interface with **per-namespace interfaces**, so `useT('home')` indexes into `ns.home` instead of filtering a global key union ([ADR 0004](adr/0004-generated-types-registry.md)):

```ts
// generated — do not edit
declare module 'next-tongue' {
  interface TongueRegister {
    locales: 'en' | 'de';
    ns: {
      home: { title: { name: string | number }; inbox: { count: number } };
      legal: { terms: { link: RichTag } };
    };
    pathnames: '/' | '/about' | '/blog/[slug]';
  }
}
```

The **default locale's** messages define the types. Other locales are validated against it (missing keys, extra keys, mismatched args) by the build and `tongue check`.

## What is checked

| Mistake | Result |
|---|---|
| `t('home.titel')` | TS error: key does not exist (with suggestion in the CLI) |
| `t('home.title')` (missing `name`) | TS error: argument required |
| `t('home.inbox', { count: '3' })` | TS error: `string` not assignable to `number` |
| `t.rich('terms', {})` (namespace `legal`) | TS error: `link` missing |
| `t.dynamic(k, { from: ['status.typo'] })` | TS error: unknown key in `from` |
| `getT('fr')` when `fr` is not configured | TS error |
| `<Link href="/abuot">` with `pathnames` set | TS error |
| `de.json` lacks `home.inbox` | build error/warning per `strict.missing` |
| `de.json` uses `{anzahl}` instead of `{count}` | build error per `strict.mismatch` |

## Regeneration

Types regenerate on `next dev` file changes, on `next build`, and via `npx tongue build` (run it in CI before `tsc`; no `postinstall` needed). Missing types are a clear error (`TONGUE_E_TYPES_MISSING`), never a silent `any`. Commit nothing in `.tongue/`.

## Performance budget
With a 10k-key registry (10 namespaces × 1,000 keys) and a consumer file of 50 typed `t()` calls:

- Absolute: cold `tsc --noEmit` **Check time ≤ 2s**
- Relative: when the no-i18n baseline Check time is ≥ 100ms, with-i18n is ≤ **+15%**

Run `pnpm --filter @next-tongue/benchmarks run measure:tsc` → `benchmarks/results/tsc-budget.json`. Incremental / tsserver completion latency still tracked under [#6](https://github.com/MrLouisWright/next-tongue/issues/6).

## Types available

```ts
import type { Locale, MessageKey, MessageArgs, Namespace } from 'next-tongue';
type A = MessageArgs<'home.inbox'>; // { count: number }
```

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
