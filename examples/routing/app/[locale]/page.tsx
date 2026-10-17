import { getT } from 'next-tongue/server';
import { ensureTongue } from '../../lib/tongue-runtime';
import { AboutLink } from './about-link';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  ensureTongue();
  const { locale } = await params;
  const t = await getT(locale, 'home');
  return (
    <main>
      <h1>{t('title')}</h1>
      <AboutLink label={t('aboutLink')} />
    </main>
  );
}
