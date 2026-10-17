import { ImageResponse } from 'next/og';
import { getT } from 'next-tongue/server';
import { OgFrame } from '../../lib/og-frame';
import { ensureTongue, isAppLocale, localeStaticParams } from '../../lib/tongue-runtime';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'next-tongue';

export function generateStaticParams() {
  ensureTongue();
  return localeStaticParams();
}

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  ensureTongue();
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    return new ImageResponse(<OgFrame locale="en" title="next-tongue" />, size);
  }
  const t = await getT(locale, 'og');
  return new ImageResponse(<OgFrame locale={locale} title={t('title')} />, {
    ...size,
  });
}
