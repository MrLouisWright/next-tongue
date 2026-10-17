import { notFound } from 'next/navigation';
import {
  ensureTongue,
  getDir,
  isAppLocale,
  localeStaticParams,
} from '../../lib/tongue-runtime';

export function generateStaticParams() {
  ensureTongue();
  return localeStaticParams();
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  ensureTongue();
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  return (
    <html lang={locale} dir={getDir(locale)}>
      <body>{children}</body>
    </html>
  );
}
