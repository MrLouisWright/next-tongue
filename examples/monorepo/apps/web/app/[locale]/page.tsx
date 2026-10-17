import { getT } from 'next-tongue/server';
import { ensureTongue } from '../../lib/tongue-runtime';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  ensureTongue();
  const { locale } = await params;
  const t = await getT(locale, 'home');
  return <h1>{t('title', { name: 'Ada' })}</h1>;
}
