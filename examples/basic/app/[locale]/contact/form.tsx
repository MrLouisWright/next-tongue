'use client';

import { useActionState } from 'react';
import { submitContact, type ContactState } from './actions';

export function ContactForm({ locale }: { locale: string }) {
  const [state, action] = useActionState(submitContact, {} as ContactState);

  return (
    <form action={action}>
      <input type="hidden" name="locale" value={locale} />
      <label>
        Email
        <input name="email" type="text" data-testid="email" />
      </label>
      <button type="submit" data-testid="submit">
        Send
      </button>
      {state.error ? <p data-testid="error">{state.error}</p> : null}
      {state.ok ? <p data-testid="ok">{state.ok}</p> : null}
    </form>
  );
}
