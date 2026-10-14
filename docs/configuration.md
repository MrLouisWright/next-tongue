# Configuration

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

All options live in `tongue.config.ts` at the project root. It is read at build time by the plugin and the CLI, and a serialisable subset (locales, default locale, routing) is inlined into the proxy and runtime — the config file itself is never shipped to the browser.

## Full shape

```ts
import { defineConfig } from 'next-tongue/config';

export default defineConfig({
  // Required
  locales: ['en', 'de', 'fr'],          // BCP 47 tags; order is used for hreflang and localeParams()
  defaultLocale: 'en',                  // must be in locales; the source language for extract/translate

  // Messages
  messages: './messages/{locale}.json', // or './messages/{locale}/{namespace}.json'
  fallback: { 'de-AT': 'de' },          // per-locale fallback chain; ends at defaultLocale (default: CLDR parents)
  timeZone: 'Europe/Berlin',            // zone for static/server date formatting (default: 'UTC'), see ADR 0008

  // Routing (see routing-and-proxy.md)
  routing: {
    prefix: 'as-needed',                // 'always' | 'as-needed' | 'never'   (default: 'as-needed')
    localeDetection: true,              // Accept-Language + cookie, in proxy.ts only (default: true)
    localeCookie: { name: 'TONGUE_LOCALE', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' }, // or false
    domains: [                          // optional, overrides prefix per domain
      { domain: 'example.de', defaultLocale: 'de', locales: ['de'] },
    ],
    pathnames: {                        // optional localized pathnames
      '/about': { de: '/ueber-uns', fr: '/a-propos' },
    },
  },

  // Formatting presets used by getFormat()/useFormat() and ICU {x, number, ::preset}
  formats: {
    number: { price: { style: 'currency', currency: 'EUR' } },
    dateTime: { short: { dateStyle: 'medium' } },
  },

  // Compiler
  outDir: '.tongue',                    // generated modules + types (default: '.tongue')
  strict: {
    missing: 'error',                   // 'error' | 'warn' | 'off'  — key missing in a locale
    unused: 'warn',                     // key never referenced in source
    mismatch: 'error',                  // ICU args/plural categories differ from defaultLocale
  },

  // CLI: tongue translate (see ai-translation.md)
  translate: {
    baseURL: 'https://api.openai.com/v1', // any OpenAI-compatible endpoint
    model: 'gpt-4.1-mini',
    apiKeyEnv: 'TONGUE_API_KEY',        // name of the env var; the key is never stored in config
    glossary: './tongue.glossary.json',
    lockfile: './tongue.lock',
    context: 'A B2B invoicing app. Formal tone (Sie in German).',
  },
});
```

## Option reference

| Option | Type | Default | Notes |
|---|---|---|---|
| `locales` | `readonly string[]` | — (required) | Validated as BCP 47. Becomes the `Locale` union type. |
| `defaultLocale` | `Locale` | — (required) | |
| `messages` | `string` | `'./messages/{locale}.json'` | Must contain `{locale}`; may contain `{namespace}`. JSON in v0.1; JSONC and YAML are under consideration for v0.3. |
| `fallback` | `Partial<Record<Locale, Locale>>` | CLDR parent locales | Resolved at compile time — missing keys are filled from the chain, so there is no runtime lookup. Without an entry, a locale falls back along CLDR parent locales (`de-AT → de`, `zh-Hant-HK → zh-Hant`, never across scripts such as `zh-Hant → zh-Hans`), then `defaultLocale`. Explicit entries override. |
| `timeZone` | IANA zone string | `'UTC'` | Passed explicitly to every `Intl.DateTimeFormat`; the server's default zone is never used. Override per call with `getFormat(locale, { timeZone })` or per subtree with `<TongueProvider timeZone>`. See [ADR 0008](adr/0008-explicit-time-zone.md). |
| `routing.prefix` | `'always' \| 'as-needed' \| 'never'` | `'as-needed'` | `'never'` requires cookie- or domain-based routing; see routing docs. |
| `routing.localeDetection` | `boolean` | `true` | Only the proxy reads headers/cookies. |
| `routing.localeCookie` | `{ name, maxAge, sameSite?, secure?, path? } \| false` | `{ name: 'TONGUE_LOCALE', maxAge: 1y, sameSite: 'lax', path: '/' }` | `sameSite: 'strict'` is allowed but discouraged: the cookie is then not sent on cross-site navigation, so returning visitors from external links get the detected locale instead of the one they chose ([next-international#453](https://github.com/QuiiBz/next-international/issues/453)). `secure` defaults to `true` on HTTPS. |
| `routing.domains` | `DomainConfig[]` | `undefined` | |
| `routing.pathnames` | `Record<string, Partial<Record<Locale, string>>>` | `undefined` | Typed: `Link href` only accepts known internal pathnames when set. |
| `formats` | `{ number?, dateTime?, list? }` | `{}` | `Intl` options by preset name. |
| `outDir` | `string` | `'.tongue'` | Git-ignore it. |
| `strict.*` | `'error' \| 'warn' \| 'off'` | see above | Used by both the build and `tongue check`. |
| `translate.*` | object | `undefined` | Only read by `tongue translate`. |

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `TONGUE_API_KEY` (configurable) | `tongue translate` | LLM API key |
| `TONGUE_DEBUG=1` | plugin, CLI | Verbose compiler logs |

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
