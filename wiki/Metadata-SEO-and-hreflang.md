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

## Translated OG images (v0.3)

`getT` reads no request data, so it works in `opengraph-image.tsx` and `twitter-image.tsx`, including when they are prerendered per locale:

```tsx
// app/[locale]/blog/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og';
import { getT, getDir } from 'next-tongue/server';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ locale: Locale; slug: string }> }) {
  const { locale, slug } = await params;
  const t = await getT(locale, 'og');
  return new ImageResponse(
    <div dir={getDir(locale)} style={{ fontSize: 64, display: 'flex' }}>{t('blogTitle', { slug })}</div>,
    size,
  );
}
```
Load a font that covers the locale's script (e.g. Arabic, CJK) via `ImageResponse`'s `fonts` option; `getDir` sets the direction.

## Translated emails (v0.3)

Email rendering usually runs in a server action, route handler or background job, outside any page. Pass the user's stored locale explicitly:

```tsx
import { getT, getFormat } from 'next-tongue/server';

export async function renderWelcomeEmail(locale: Locale, user: { name: string; createdAt: Date; timeZone?: string }) {
  const t = await getT(locale, 'emails');
  const f = await getFormat(locale, { timeZone: user.timeZone ?? 'UTC' });
  return {
    subject: t('welcome.subject', { name: user.name }),
    html: renderToStaticMarkup(<WelcomeEmail t={t} joined={f.dateTime(user.createdAt, 'short')} />), // react-dom/server, or your email renderer
  };
}
```
`t.rich` works in email templates. For plain-text parts use `t()`. Never infer the locale from a request header in a job; store it with the user.
