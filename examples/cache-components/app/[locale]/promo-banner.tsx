import { formatMessage } from 'next-tongue/server';

/**
 * Request-time ICU from a "CMS" string — pure, safe inside `'use cache'` (#34).
 */
export async function PromoBanner({
  locale,
  icu,
}: {
  locale: string;
  icu: string;
}) {
  'use cache';
  const text = formatMessage(locale, icu, { pct: '20%', product: 'Pro' });
  return <p data-promo>{text}</p>;
}
