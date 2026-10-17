import { getTranslations } from 'next-intl/server';

/** No locale in scope — should get TODO(tongue). */
export default async function About() {
  const t = await getTranslations('about');
  return <h1>{t('title')}</h1>;
}
