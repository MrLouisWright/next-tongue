# Server actions

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

Server actions have no `params`. Pass the locale explicitly — either bound or as a form field — and validate it ([ADR 0002](adr/0002-locale-from-params-only.md), [#26](https://github.com/MrLouisWright/next-tongue/issues/26)).

## Bound argument (recommended)

```tsx typecheck
// app/[locale]/contact/actions.ts
'use server';
import { getT, withLocale } from 'next-tongue/server';

type State = { error?: string; ok?: string };

async function sendMessageImpl(
  locale: string,
  _prev: State,
  form: FormData,
): Promise<State> {
  const t = await getT(locale, 'contact');
  const email = form.get('email');
  if (typeof email !== 'string' || !email.includes('@')) {
    return { error: t('invalidEmail') };
  }
  return { ok: t('sent') };
}

/** Validates the bound locale; throws `TONGUE_E_LOCALE` if tampered. */
export const sendMessage = withLocale(sendMessageImpl);
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
Read it with `form.get('locale')` and validate with `isLocale()` (or wrap a bound action with `withLocale`).

## Route handlers and code outside `[locale]`

Route handlers, the root `not-found`, and `output: 'export'` entry pages have no `[locale]` segment. Pass a stored or form locale explicitly — never call `headers()` / `cookies()` inside next-tongue helpers (ADR 0002). Example:

```ts
// app/api/hello/route.ts
import { getT, isLocale } from 'next-tongue/server';

export async function POST(req: Request) {
  const body = await req.json();
  const locale = isLocale(body.locale) ? body.locale : 'en';
  const t = await getT(locale, 'api');
  return Response.json({ message: t('hello') });
}
```

## Translated validation errors (v0.3)

`translateIssues` turns validation issues into typed, translated messages. It is schema-agnostic: it accepts any array shaped like [Standard Schema](https://standardschema.dev) issues (`{ message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> }`), so it works with any validator that emits that shape. next-tongue has no validator dependency.

```ts typecheck
'use server';
import { getT, translateIssues, withLocale } from 'next-tongue/server';

type State = { errors?: Record<string, string[]> };

declare const schema: {
  '~standard': {
    validate: (
      data: unknown,
    ) => Promise<{ issues?: readonly { message: string; path?: readonly PropertyKey[] }[] }>;
  };
};

async function signupImpl(
  locale: string,
  _prev: State,
  form: FormData,
): Promise<State> {
  const result = await schema['~standard'].validate(Object.fromEntries(form));
  if (result.issues) {
    const t = await getT(locale, 'validation');
    return { errors: translateIssues(t, result.issues) };
  }
  return {};
}

export const signup = withLocale(signupImpl);
```

- An issue's `message` is treated as a **key** in the namespace (typed: `translateIssues` accepts `T<'validation'>`, and unknown keys hit `fallback`).
- `params` per issue (`{ message: 'tooShort', params: { min: 8 } }`) become ICU args.
- Options: `{ fallback?: Key; formatPath?: (path) => string }`. Result: `Record<string, string[]>`, with root issues under `''`.
- Works the same in route handlers and client components (`useT('validation')` + `translateIssues` from `next-tongue/client`).

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
