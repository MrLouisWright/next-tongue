import type { Metadata } from 'next';
import { getFormat, getT } from 'next-tongue/server';
import { FIXED_INSTANT } from '../../lib/fixed-instant';
import { ensureTongue, isAppLocale } from '../../lib/tongue-runtime';
import { ClientDate } from './client-date';
import { LanguageMenu } from './language-menu';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  ensureTongue();
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  const t = await getT(locale, 'home');
  return { title: t('metaTitle') };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  ensureTongue();
  const { locale } = await params;
  if (!isAppLocale(locale)) return null;

  const t = await getT(locale, 'home');
  const f = await getFormat(locale);
  const serverDate = f.dateTime(FIXED_INSTANT, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <main>
      <LanguageMenu />
      <h1>{t('title', { name: 'Ada' })}</h1>
      <p>{t('body')}</p>
      <p>
        Server:{' '}
        <time data-testid="server-date" dateTime={new Date(FIXED_INSTANT).toISOString()}>
          {serverDate}
        </time>
      </p>
      <p>
        Client: <ClientDate />
      </p>
    </main>
  );
}
