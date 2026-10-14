> 📄 Mirrors [`docs/server-actions.md`](https://github.com/MrLouisWright/next-tongue/blob/main/docs/server-actions.md) in the main repo — the repo version is canonical.

# Server actions

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](Roadmap).

Server actions have no `params`. Pass the locale explicitly — either bound or as a form field — and validate it ([ADR 0002](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0002-locale-from-params-only.md), [#26](https://github.com/MrLouisWright/next-tongue/issues/26)).

## Bound argument (recommended)

```tsx
// app/[locale]/contact/actions.ts
'use server';
import { getT, isLocale } from 'next-tongue/server';

export async function sendMessage(locale: string, prev: State, form: FormData): Promise<State> {
  if (!isLocale(locale)) throw new Error('Invalid locale');
  const t = await getT(locale, 'contact');
  const email = form.get('email');
  if (typeof email !== 'string' || !email.includes('@')) {
    return { error: t('errors.invalidEmail') };
  }
  // ...
  return { ok: t('sent') };
}
```

```tsx
// app/[locale]/contact/form.tsx
'use client';
import { useActionState } from 'react';
import { useLocale } from 'next-tongue/client';
import { sendMessage } from './actions';

export function ContactForm() {
  const locale = useLocale();
  const [state, action] = useActionState(sendMessage.bind(null, locale), {});
  return <form action={action}>{/* ... */}</form>;
}
```

> Bound arguments are visible to the client and can be tampered with — always validate with `isLocale()`. The locale only selects a language; never use it for authorization.

## Redirecting from an action

```ts
import { redirect } from 'next-tongue/navigation';
redirect({ href: '/thanks', locale });
```

## Hidden form field

```tsx
<form action={sendMessage}><input type="hidden" name="locale" value={locale} />…</form>
```
Read it with `form.get('locale')` and validate with `isLocale()`. `withLocale(action)` (v0.2) wraps an action whose first argument is a bound locale, validates it and throws `TONGUE_E_LOCALE` otherwise.

## Translated validation errors (v0.3)

`translateIssues` turns validation issues into typed, translated messages. It is schema-agnostic: it accepts any array shaped like [Standard Schema](https://standardschema.dev) issues (`{ message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> }`), so it works with any validator that emits that shape. next-tongue has no validator dependency.

```ts
'use server';
import { getT, translateIssues, isLocale } from 'next-tongue/server';

export async function signup(locale: string, prev: State, form: FormData): Promise<State> {
  if (!isLocale(locale)) throw new Error('Invalid locale');
  const result = await schema['~standard'].validate(Object.fromEntries(form)); // any Standard Schema validator
  if (result.issues) {
    const t = await getT(locale, 'validation');
    return { errors: translateIssues(t, result.issues) }; // { email: ['Enter a valid email'], ... }
  }
  // ...
}
```

- An issue's `message` is treated as a **key** in the namespace (typed: `translateIssues` accepts `T<'validation'>`, and unknown keys hit `fallback`).
- `params` per issue (`{ message: 'tooShort', params: { min: 8 } }`) become ICU args.
- Options: `{ fallback?: Key; formatPath?: (path) => string }`. Result: `Record<string, string[]>`, with root issues under `''`.
- Works the same in route handlers and client components (`useT('validation')` + `translateIssues` from `next-tongue/client`).
