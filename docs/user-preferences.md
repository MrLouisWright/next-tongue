# Per-user preferred language

> **Status: planned / pre-release.** This recipe works with the v0.2 APIs; the `setLocalePreference` helper and the `createProxy({ resolveLocale })` hook ship in v1.1 ([#48](https://github.com/MrLouisWright/next-tongue/issues/48)). See [ROADMAP](../ROADMAP.md).

Signed-in users often have a preferred language stored in your database. next-tongue resolves it **in the proxy from a signed cookie**. It never calls the database in the proxy and never reads headers inside cached scopes ([ADR 0002](adr/0002-locale-from-params-only.md)).

## How it works
1. **Save:** a server action validates the locale, stores it in your DB and sets a signed cookie.
2. **Login:** after authentication, the login action reads the stored preference and sets the same signed cookie.
3. **Resolve:** `proxy.ts` verifies the cookie's signature (Web Crypto, no DB call) and redirects or rewrites to that locale. Pages still get the locale from `params`, so the static shell is unaffected.

## Server action (v1.1 helper)

```ts
// app/[locale]/settings/actions.ts
'use server';
import { setLocalePreference } from 'next-tongue/server';
import { redirect } from 'next-tongue/navigation';

export async function saveLanguage(form: FormData) {
  const id = await userId();
  const locale = await setLocalePreference(form.get('locale'), {   // validates with isLocale(), throws TONGUE_E_LOCALE
    secret: process.env.TONGUE_PREF_SECRET!,                      // HMAC-SHA-256 via Web Crypto
    save: (l) => db.user.update({ where: { id }, data: { locale: l } }),
  });
  redirect({ href: '/settings', locale });
}
```

Before v1.1, set the cookie yourself in an action: `(await cookies()).set('TONGUE_PREF', value, { httpOnly: true, sameSite: 'lax', secure: true })`, where `value` is `locale + '.' + hmac` computed with `crypto.subtle`.

## Proxy (v1.1 hook)

```ts
// proxy.ts
import { createProxy, verifyLocalePreference } from 'next-tongue/proxy';

export const proxy = createProxy({
  // Runs before cookie/Accept-Language detection. Return a configured locale or undefined.
  resolveLocale: (req) => verifyLocalePreference(req.cookies.get('TONGUE_PREF')?.value, process.env.TONGUE_PREF_SECRET!),
});
```

- The proxy never calls your database; the signed cookie carries the preference.
- An invalid or unsigned value is ignored (normal detection applies); only configured locales are accepted.
- An explicit URL prefix still wins: `/de/...` stays German even if the preference is `fr`. The [locale switcher](client-components.md#locale-switcher) ([#44](https://github.com/MrLouisWright/next-tongue/issues/44)) updates the preference.

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
