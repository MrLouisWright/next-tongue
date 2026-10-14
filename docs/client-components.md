# Client components

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

## Setup

`TongueProvider` (in your `[locale]` layout, see [Getting started](getting-started.md)) provides the **locale only**. It does not take a `messages` prop.

## `useT(namespace?)`

```tsx
'use client';
import { useT } from 'next-tongue/client';

export function Counter() {
  const t = useT('counter');
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>{t('clicked', { count: n })}</button>;
}
```

## How messages reach the browser

At build time the compiler finds every `useT(...)` / `t(...)` call in client modules and rewrites it to import the compiled message functions directly from `.tongue/`, split per locale. The client bundle for a route contains only:

- the message functions for keys referenced by client components on that route, and
- only for the active locale (loaded via a small per-locale chunk).

No JSON catalog is serialised into the RSC payload or HTML. See [Architecture](architecture.md).

### Dynamic keys

```tsx
t(`status.${status}`)  // status: 'open' | 'closed'
```
If the template's possible values are a finite string-literal union, the compiler includes all matching keys. Truly dynamic keys (`t(someString)`) are a **type error** in strict mode; use `t.dynamic(key)` to opt in, which includes the whole namespace in the bundle and emits a build warning.

## Other hooks

| Hook | Returns |
|---|---|
| `useLocale()` | `Locale` from the provider |
| `useFormat()` | Same API as `getFormat` (number, dateTime, relativeTime, list) |
| `useRouter()`, `usePathname()` | from `next-tongue/navigation` |

## Locale switcher

```tsx
'use client';
import { Link, usePathname } from 'next-tongue/navigation';
import { useLocale } from 'next-tongue/client';
import { locales } from 'next-tongue/config';

export function LocaleSwitcher() {
  const pathname = usePathname();
  const current = useLocale();
  return locales.map((l) => (
    <Link key={l} href={pathname} locale={l} aria-current={l === current ? 'true' : undefined}>{l}</Link>
  ));
}
```
(`locales` is a re-export of the configured tuple, inlined at build time.)
