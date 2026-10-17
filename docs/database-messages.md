# Database and CMS messages

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

next-tongue supports translations stored in a database or CMS in two ways ([ADR 0013](adr/0013-database-and-cms-messages.md)). Both need no extra dependencies, and neither ships a catalog to the browser.

| | Build-time `sources` (v0.4) | Request-time `formatMessage` (v0.2) |
|---|---|---|
| When it runs | `tongue build` / `next build` / `next dev` | On the server, per render |
| Typed keys and args | ✅ | ❌ (untyped string) |
| Validated (plurals, arg parity) | ✅ at build | at render (throws on invalid ICU) |
| Change without rebuild | ❌ | ✅ |
| Client components | via `useT` like file messages | pass the rendered string as a prop |

## 1. Build-time sources

```ts
// tongue.config.ts
import { defineConfig } from 'next-tongue/config';
import { fetchTranslations } from './lib/cms';

export default defineConfig({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  messages: './messages/{locale}.json',
  sources: [
    async () => fetchTranslations(), // → { en: { marketing: { hero: 'Hello {name}' } }, de: { ... } }
  ],
  sourcesOnError: 'fail', // or 'use-cache' to reuse .tongue/sources.json
});
```

- Each source returns `{ [locale]: { [namespace]: { [key]: icuString } } }`.
- Sources are merged after file messages, in array order; later entries win. `tongue check` reports keys defined in more than one place.
- Merged messages are compiled, validated and typed like file messages.
- Use only built-in `fetch` or your own DB client in the source function; next-tongue adds nothing.

### Rebuild and revalidation guidance
- Build-time messages change only on rebuild. Trigger a redeploy from a CMS webhook (e.g. a Vercel/Netlify deploy hook) when translations are published.
- In `next dev`, sources are fetched on start and on `tongue build --watch-sources <seconds>`; file edits still hot-reload.
- Keep fast-changing copy (banners, promotions) out of `sources`; use `formatMessage` below.
- CI: set `sourcesOnError: 'use-cache'` only if a stale snapshot is acceptable; commit nothing in `.tongue/`.

## 2. Request-time `formatMessage`

```tsx typecheck
// app/[locale]/promo.tsx (Server Component)
import { formatMessage } from 'next-tongue/server';
import { cacheLife, cacheTag } from 'next/cache';

declare const db: {
  promo: { find: (locale: string) => Promise<{ text: string }> };
};

async function getPromo(locale: string) {
  'use cache';
  cacheTag('promo');
  cacheLife('hours');
  const row = await db.promo.find(locale);
  return formatMessage(locale, row.text, { pct: 0.2, product: 'Pro' });
}

void getPromo;
```

- Server-only (`import 'server-only'` guard); untyped `values`; returns a `string`.
- Compiled messages are cached in a bounded LRU (`formatMessage.configure({ cacheSize: 500 })`, default 500 entries).
- Pure: reads no request data, so it works inside `'use cache'`. Revalidate the data with `cacheTag`/`revalidateTag` when editors publish.
- **Rich-text safety:** tags in stored messages are stripped (text kept) by default. Use `formatMessage.rich(locale, icu, values, { tags: { b: (c) => <b>{c}</b> } })` to render only allow-listed tags as React nodes. Output is never raw HTML; values are always inserted as text, so stored messages cannot inject markup or attributes.
- Uses the same supported ICU subset as compiled messages ([ICU messages](icu-messages.md)); unsupported syntax throws `TONGUE_E_ICU_SYNTAX`.

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
