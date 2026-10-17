import { getT } from 'next-tongue/server';
import { ensureTongue } from '../../../lib/tongue-runtime';

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  ensureTongue();
  const { locale } = await params;
  const t = await getT(locale, 'about');
  return (
    <main>
      <h1 data-testid="about-title">{t('title')}</h1>
    </main>
  );
}
