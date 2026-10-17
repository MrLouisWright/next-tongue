import { notFound } from 'next/navigation';
import { TongueProvider } from 'next-tongue/client';
import {
  ensureTongue,
  getDir,
  isAppLocale,
  localeStaticParams,
} from '../../lib/tongue-runtime';
import { loadClientNamespace } from '../../lib/tongue-client';

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
      <body>
        <TongueProvider locale={locale} loadNamespace={loadClientNamespace}>
          {children}
        </TongueProvider>
      </body>
    </html>
  );
}
