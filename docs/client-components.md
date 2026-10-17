# Client components

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

## Setup

`TongueProvider` (in your `[locale]` layout, see [Getting started](getting-started.md)) provides the **locale** (and optionally a `timeZone` for `useFormat`, see [ADR 0008](adr/0008-explicit-time-zone.md)). It does not take a `messages` prop.

Outside `[locale]` (global `app/not-found.tsx`, the static-export root `app/page.tsx`) there is no provider: `useT` throws `TONGUE_E_NO_PROVIDER`. Wrap such trees in `<TongueProvider locale={defaultLocale}>` deliberately ([ADR 0002](adr/0002-locale-from-params-only.md)).

## Preferred: translate on the server, pass strings

The cheapest client messages are none. Render text in a Server Component and pass it down:

```tsx
// app/[locale]/page.tsx (Server Component)
const t = await getT(locale, 'counter');
return <Counter label={t('label')} />; // Counter is a client component; no message code ships
```

Use `useT` only when the client needs to format at runtime (e.g. a count that changes with state). See [ADR 0009](adr/0009-client-message-delivery.md).

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

A per-file loader rewrites each `t('key')` call in a client module into a static import of a per-key message module (`#tongue/msg/{namespace}/{key}`). The bundler then includes only the keys that client code calls, deduplicated across routes.

- **Default:** a per-key module contains **all locales** of that key and picks the provider's locale. No extra request, no Suspense.
- **Opt-in (later):** per-locale splitting with dynamic imports and a Suspense contract, once the benchmark has measured when it pays off.
- If `t` escapes the file (passed as a prop or argument, returned, stored in an object), the loader includes the whole namespace and warns with `file:line`.

No JSON catalog is serialised into the RSC payload or HTML. See [Architecture](architecture.md).

### Dynamic keys

```tsx
t(`status.${status}`)  // status: 'open' | 'closed'
```
Non-literal keys must **declare their possible keys**; the loader has no type information, so it cannot infer a union from `status`'s type.

```tsx
t.dynamic(`status.${status}`, { from: ['status.open', 'status.closed'] }); // imports only these two
const s = t.ns('status'); s(status);                                        // imports the whole `status` namespace
```
An undeclared non-literal key (`t(someString)`) is a build error, `TONGUE_E_DYNAMIC_KEY`.

## Other hooks

| Hook | Returns |
|---|---|
| `useLocale()` | `Locale` from the provider |
| `useFormat()` | Same API as `getFormat` (number, dateTime, relativeTime, list) |
| `useRouter()`, `usePathname()` | from `next-tongue/navigation` |

## Locale switcher

`next-tongue/navigation` ships a **headless, accessible** switcher (v0.3, [#44](https://github.com/MrLouisWright/next-tongue/issues/44)). It keeps the current page (including localized pathnames and dynamic params), persists the choice through the locale cookie (or the signed preference, see [User preferences](user-preferences.md)), and labels each locale in its own language via `Intl.DisplayNames`.

```tsx typecheck
'use client';
import { createNavigation } from 'next-tongue/navigation';

const { LocaleSwitcher } = createNavigation({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  prefix: 'as-needed',
});

export function LanguageMenu() {
  return (
    <LocaleSwitcher>
      {(options) => (
        <nav aria-label="Language">
          {options.map(({ locale, label, href, current }) => (
            <a
              key={locale}
              href={href}
              hrefLang={locale}
              lang={locale}
              aria-current={current ? 'page' : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
      )}
    </LocaleSwitcher>
  );
}
```
It renders plain links, so it works without JavaScript. `useLocaleSwitcher()` returns the same options for custom UIs (e.g. a `<select>`).

(`locales` is the configured tuple, inlined at build time; it is also exported from `next-tongue/server`. `next-tongue/config` is build-time only and must not be imported from app code.)

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
