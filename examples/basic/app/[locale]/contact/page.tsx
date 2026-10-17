import { getT } from 'next-tongue/server';
import { ensureTongue, isAppLocale } from '../../../lib/tongue-runtime';
import { ContactForm } from './form';

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  ensureTongue();
  const { locale } = await params;
  if (!isAppLocale(locale)) return null;

  const t = await getT(locale, 'contact');
  return (
    <main>
      <h1>{t('title')}</h1>
      <ContactForm locale={locale} />
    </main>
  );
}
