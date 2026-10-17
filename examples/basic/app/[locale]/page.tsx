import { getT } from 'next-tongue/server';
import { ensureTongueRuntime, isAppLocale } from '../../lib/tongue-runtime';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await ensureTongueRuntime();
  const { locale } = await params;
  if (!isAppLocale(locale)) return null;

  const t = await getT(locale, 'home');
  return (
    <main>
      <h1>{t('title', { name: 'Ada' })}</h1>
      <p>{t('body')}</p>
    </main>
  );
}
