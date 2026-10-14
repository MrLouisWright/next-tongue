# Type safety

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

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
With a 10k-key registry: cold `tsc --noEmit` ≤ 15% slower than the same app without i18n; incremental checks and tsserver completion latency are measured with `--extendedDiagnostics` and `--generateTrace` and published ([#6](https://github.com/MrLouisWright/next-tongue/issues/6)).

## Types available

```ts
import type { Locale, MessageKey, MessageArgs, Namespace } from 'next-tongue';
type A = MessageArgs<'home.inbox'>; // { count: number }
```

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
