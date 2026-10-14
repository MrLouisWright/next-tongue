# Server actions

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

Server actions have no `params`. Pass the locale explicitly — either bound or as a form field — and validate it.

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

## Validation libraries

Return translation **keys** from schemas and translate at the edge of the action, or build the schema per request: `makeSchema(t)`. A Zod error-map helper is a candidate for v0.9+ (not committed).

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
