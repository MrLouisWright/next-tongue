# Server components

> **Status: beta 0.9 (API freeze).** Install `next-tongue` from npm. See [ROADMAP](../ROADMAP.md) and [API freeze](api-freeze.md).

## `getT(locale, namespace?)`

```tsx
import { getT } from 'next-tongue/server';

export default async function Page({ params }: PageProps<'/[locale]/blog'>) {
  const { locale } = await params;
  const t = await getT(locale, 'blog');
  return (
    <>
      <h1>{t('title')}</h1>
      <p>{t('posts', { count: 3 })}</p>
    </>
  );
}
```

- `locale` is **required** and typed as `Locale`. Passing a plain `string` is a type error — narrow with `isLocale()` first (or rely on the typed `params` codegen generates).
- `getT` is async because it `import()`s the compiled module for that locale+namespace. It is safe inside `'use cache'` (it reads no request data).
- Without a namespace, keys are dotted paths: `t('blog.title')`.

## Rich text

```json
{ "terms": "I accept the <link>terms</link>." }
```
```tsx
t.rich('terms', { link: (chunks) => <Link href="/terms">{chunks}</Link> })
```
Tags are typed: omitting `link` is a type error.

## Formatting

```tsx
import { getFormat } from 'next-tongue/server';
const f = await getFormat(locale);
f.number(1234.5, 'price');            // preset from config
f.dateTime(date, { dateStyle: 'long' });
f.relativeTime(date, now);           // pass "now" explicitly — keeps output cacheable
f.list(['a', 'b'], { type: 'conjunction' });
```

## Passing locale down

Only pages, layouts, `generateMetadata` and route handlers receive `params`. Pass `locale` to nested server components as a typed prop (`{ locale: Locale }`). This is explicit by design and is what makes the component cacheable: the locale becomes part of its `'use cache'` key. There is deliberately **no** `getLocale()` that reads request headers (see [ADR 0002](adr/0002-locale-from-params-only.md)).

## Route handlers

```ts
// app/[locale]/api/hello/route.ts
import { getT, isLocale } from 'next-tongue/server';

export async function GET(_: Request, ctx: RouteContext<'/[locale]/api/hello'>) {
  const { locale } = await ctx.params;
  if (!isLocale(locale)) return new Response('Not found', { status: 404 });
  const t = await getT(locale);
  return Response.json({ message: t('api.hello') });
}
```

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
