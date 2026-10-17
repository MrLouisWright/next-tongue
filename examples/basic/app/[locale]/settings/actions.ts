'use server';

import { setLocalePreference } from 'next-tongue/server';
import { redirect } from '../../../lib/navigation-server';
import { ensureTongue } from '../../../lib/tongue-runtime';

/** Demo in-memory store (real apps use a DB). */
const prefs = new Map<string, string>();

export async function saveLanguage(form: FormData) {
  ensureTongue();
  const secret = process.env.TONGUE_PREF_SECRET ?? 'basic-example-pref-secret';
  const locale = await setLocalePreference(form.get('locale'), {
    secret,
    // Local example / Playwright run over HTTP.
    secure: process.env.NODE_ENV === 'production',
    save: async (l) => {
      prefs.set('demo-user', l);
    },
  });
  redirect({ href: '/settings', locale: locale as 'en' | 'de' });
}

/** Simulate post-login: restore stored preference into the signed cookie. */
export async function loginWithPreference() {
  ensureTongue();
  const secret = process.env.TONGUE_PREF_SECRET ?? 'basic-example-pref-secret';
  const stored = (prefs.get('demo-user') ?? 'de') as 'en' | 'de';
  await setLocalePreference(stored, {
    secret,
    secure: process.env.NODE_ENV === 'production',
  });
  redirect({ href: '/', locale: stored });
}
