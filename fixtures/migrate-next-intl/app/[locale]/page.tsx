import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const tServer = await getTranslations('home');
  return <Client title={tServer('title')} />;
}

function Client({ title }: { title: string }) {
  const t = useTranslations('home');
  return (
    <main>
      <h1>{title}</h1>
      <p>{t('body')}</p>
    </main>
  );
}
