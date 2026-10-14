# Type safety

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

The compiler emits `.tongue/types.d.ts`, which augments a registry interface:

```ts
// generated — do not edit
declare module 'next-tongue' {
  interface TongueRegister {
    locales: 'en' | 'de';
    messages: {
      'home.title': { name: string | number };
      'home.inbox': { count: number };
      'terms': { link: RichTag };
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
| `t.rich('terms', {})` | TS error: `link` missing |
| `getT('fr')` when `fr` is not configured | TS error |
| `<Link href="/abuot">` with `pathnames` set | TS error |
| `de.json` lacks `home.inbox` | build error/warning per `strict.missing` |
| `de.json` uses `{anzahl}` instead of `{count}` | build error per `strict.mismatch` |

## Regeneration

Types regenerate on `next dev` file changes, on `next build`, and via `npx tongue extract --types-only` (useful in CI before `tsc`). Commit nothing in `.tongue/`.

## Types available

```ts
import type { Locale, MessageKey, MessageArgs, Namespace } from 'next-tongue';
type A = MessageArgs<'home.inbox'>; // { count: number }
```
