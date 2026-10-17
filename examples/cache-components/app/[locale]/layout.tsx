import { notFound } from 'next/navigation';
import { getDir } from 'next-tongue/server';
import { ExampleTongueProvider } from '../../lib/tongue-client';
import { ensureTongueRuntime, isAppLocale, localeStaticParams } from '../../lib/tongue-runtime';

export function generateStaticParams() {
  return localeStaticParams();
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await ensureTongueRuntime();
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();

  return (
    <html lang={locale} dir={getDir(locale)}>
      <body>
        <ExampleTongueProvider locale={locale}>{children}</ExampleTongueProvider>
      </body>
    </html>
  );
}
