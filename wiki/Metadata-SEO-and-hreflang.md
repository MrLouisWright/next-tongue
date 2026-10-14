> 📄 Mirrors [`docs/metadata-seo.md`](https://github.com/MrLouisWright/next-tongue/blob/main/docs/metadata-seo.md) in the main repo — the repo version is canonical.

# Metadata, SEO & hreflang

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](Roadmap).

## Localized metadata

```tsx
// app/[locale]/about/page.tsx
import type { Metadata } from 'next';
import { getT, generateAlternates } from 'next-tongue/server';

export async function generateMetadata({ params }: PageProps<'/[locale]/about'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getT(locale, 'about');
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: generateAlternates({ href: '/about', locale }),
  };
}
```

`generateAlternates({ href, locale })` returns:
```ts
{
  canonical: '/de/ueber-uns',
  languages: { en: '/about', de: '/de/ueber-uns', 'x-default': '/about' },
}
```
It respects `prefix`, localized `pathnames` and `domains` (absolute URLs when domains differ). Set `metadataBase` in the root layout for absolute URLs.

## Sitemap

```ts
// app/sitemap.ts
import type { MetadataRoute } from 'next';
import { getPathname } from 'next-tongue/navigation';
import { locales } from 'next-tongue/server';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/about'].map((href) => ({
    url: `https://example.com${getPathname({ href, locale: 'en' })}`,
    alternates: { languages: Object.fromEntries(locales.map((l) => [l, `https://example.com${getPathname({ href, locale: l })}`])) },
  }));
}
```

## `<html lang>` and `dir`

Set `lang={locale}` in the root layout. `getDir(locale)` (server) returns `'ltr' | 'rtl'`.

## Open Graph

`generateAlternates` does not set `openGraph.locale`; use `getOgLocale(locale)` from `next-tongue/server`.

