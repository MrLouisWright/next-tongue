import { Suspense } from 'react';
import { getT } from 'next-tongue/server';
import { ensureTongue, isAppLocale } from '../../lib/tongue-runtime';
import { InboxBadge } from './inbox-badge';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  ensureTongue();
  const { locale } = await params;
  if (!isAppLocale(locale)) return null;

  const t = await getT(locale, 'home');

  return (
    <main>
      <h1>{t('title', { name: 'Ada' })}</h1>
      <p>{t('inbox', { count: 3 })}</p>
      <Suspense fallback={<p>{t('loading')}</p>}>
        <InboxBadge count={1} />
      </Suspense>
    </main>
  );
}
