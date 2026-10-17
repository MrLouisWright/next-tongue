import { getT } from 'next-tongue/server';
import { ensureTongue, isAppLocale } from '../../lib/tongue-runtime';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  ensureTongue();
  const { locale } = await params;
  if (!isAppLocale(locale)) return null;
  const t = await getT(locale, 'og');
  return (
    <main>
      <h1>{t('title')}</h1>
      <p data-testid="locale">{locale}</p>
    </main>
  );
}
