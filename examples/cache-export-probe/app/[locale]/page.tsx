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
  return <h1>{t('title')}</h1>;
}
