import { getT } from 'next-tongue/server';
import { ensureTongue } from '../../../lib/tongue-runtime';
import { loginWithPreference, saveLanguage } from './actions';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  ensureTongue();
  const { locale } = await params;
  const t = await getT(locale, 'settings');

  return (
    <main>
      <h1>{t('title')}</h1>
      <p>{t('body')}</p>
      <form action={saveLanguage} data-testid="pref-form">
        <label>
          {t('language')}
          <select name="locale" defaultValue={locale} data-testid="pref-locale">
            <option value="en">English</option>
            <option value="de">Deutsch</option>
          </select>
        </label>
        <button type="submit" data-testid="pref-save">
          {t('save')}
        </button>
      </form>
      <form action={loginWithPreference}>
        <button type="submit" data-testid="pref-login">
          {t('login')}
        </button>
      </form>
    </main>
  );
}
