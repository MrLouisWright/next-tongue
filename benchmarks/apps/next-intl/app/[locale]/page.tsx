'use client';

import { useTranslations } from 'next-intl';

/** Client route that uses only 2 of 500 catalog keys. */
export default function Page() {
  const t = useTranslations('bench');
  return (
    <main>
      <p>{t('k0', { name: 'Ada' })}</p>
      <p>{t('k1', { name: 'Ada' })}</p>
    </main>
  );
}
