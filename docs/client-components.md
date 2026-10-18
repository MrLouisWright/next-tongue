# Client components

> **Status: beta 0.9 (API freeze).** Install `next-tongue` from npm. See [ROADMAP](../ROADMAP.md) and [API freeze](api-freeze.md).

## Setup

`TongueProvider` (in your `[locale]` layout, see [Getting started](getting-started.md)) provides the **locale** (and optionally a `timeZone` for `useFormat`, see [ADR 0008](adr/0008-explicit-time-zone.md)). It does not take a `messages` prop.

Outside `[locale]` (global `app/not-found.tsx`, root `app/layout.tsx` chrome, static-export root) there is no locale param. Wrap those trees in `<TongueProvider locale={…}>` (see [Routing — root-layout chrome](routing-and-proxy.md#root-layout-chrome-header--footer-outside-locale)). Prefer passing server-translated strings into Header/Footer instead of `useT` in the root layout.

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

`TongueProvider` does **not** need a `loadNamespace` prop when the call-site loader rewrites literal `t('key')` (Turbopack/webpack, including SSR from 0.9.5). Pass `loadNamespace` for tests or when the loader cannot run. If a call is not rewritten (dynamic key without `t.dynamic`), invoking `t` throws `TONGUE_E_NO_PROVIDER` with a rewrite hint.

Disable the Alt+Shift+T overlay with `devOverlay={false}` (or config `devOverlay: false`) if needed.

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
t.dynamic(status, { from: ['open', 'closed'] }); // loader imports only these two keys
const FROM = ['open', 'closed'] as const;
t.dynamic(status, { from: FROM });               // key narrowed to 'open' | 'closed'
t.dynamic(BTN_KEYS[mode], { from: Object.values(BTN_KEYS) }); // same-file object values
const s = t.ns('status'); s(status);              // needs loadNamespace / escape path
```

The call-site loader rewrites `t.dynamic(key, { from })` to a map of per-key imports (same as literal `t('…')`) when `from` is an **inline array**, a **same-file** `const` array, or `Object.values(sameFileConst)`. Imported or computed `from` expressions are not resolved and stay as the runtime stub (throws without `loadNamespace`). Prefer that over ternaries. An undeclared non-literal `t(someString)` without `from` is not rewritten and will throw at runtime without `loadNamespace`. `tongue check` reports those client sites as `dynamic` errors.

### Ternaries and conditionals

Each **literal** call is rewritten on its own:

```tsx
pending ? t('saving') : t('changePassword');
toast(v ? t('dirIn') : t('dirOut'));
```

Both legs become per-key imports. A variable key still needs `t.dynamic`.

### When to use what

| Situation | Prefer |
|---|---|
| Server page / layout / API / Server Action | `getT(locale, ns)` + `t('literal')` |
| Client component, fixed keys | `useT(ns)` + `t('literal')` (loader imports) |
| Client component, key from data / map / step | `t.dynamic(key, { from: [...] })` or pass **strings** from a server parent |
| Root chrome outside `[locale]` | Server `getT` + pass strings as props — avoid a second `TongueProvider` |

Never `LINKS.map(({ key }) => t(key))` on the client — that typechecks and often “works” in a misconfigured local setup, then throws in production when the stub runs.

### One `TongueProvider` (or two, deliberately)

- **Greenfield:** one provider under `[locale]` that owns locale from `params`.
- **Existing root layout:** root `TongueShell` for Header/Footer + inner `[locale]` provider with `params.locale` and `devOverlay={false}` is the documented hybrid — see [Routing](routing-and-proxy.md#root-layout-chrome-header--footer-outside-locale).

### `useLocale()` is not a loader ritual

The call-site loader injects `const __tongue_locale = useLocale()` when it rewrites `t('…')` / `t.dynamic`. You do **not** need a bare `useLocale()` (or an unused `const _ = useLocale()`) in source for rewrites to work. Call it only when your component needs the locale string (HtmlLang, fetch headers, etc.).

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

// createNavigation is required — Link / LocaleSwitcher are not top-level exports
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
