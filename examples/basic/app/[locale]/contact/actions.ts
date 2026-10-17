'use server';

import { getT, isLocale } from 'next-tongue/server';
import { ensureTongue } from '../../../lib/tongue-runtime';

export type ContactState = { error?: string; ok?: string };

/**
 * Hidden-field locale pattern (#26). Works with and without JS.
 * Prefer `withLocale(action).bind(null, locale)` when binding from a client component.
 */
export async function submitContact(
  _prev: ContactState,
  form: FormData,
): Promise<ContactState> {
  ensureTongue();
  const locale = String(form.get('locale') ?? '');
  if (!isLocale(locale)) {
    return { error: 'Invalid locale' };
  }
  const t = await getT(locale, 'contact');
  const email = form.get('email');
  if (typeof email !== 'string' || !email.includes('@')) {
    return { error: t('invalidEmail') };
  }
  return { ok: t('sent') };
}
