# AI translation (Loomlocale)

next-tongue 1.0 translates through the [Loomlocale](https://loomlocale.com) hosted API. There is no API key to manage: you log in once and the CLI stores a token.

```bash
npx next-tongue            # guided wizard: detect → pick languages → estimate → translate
# or step by step
npx tongue login
npx tongue link
npx tongue update
```

## How a run works
1. **Pull** web edits and the project glossary (`POST /projects/:id/sync`, `mode: "pull"`).
2. **Diff** every source key against `tongue.lock` (sha256 of source + target). Only *new*, *changed* or *missing* keys are sent. Targets you edited by hand are never overwritten.
3. **Translate**: ICU args and tags are masked as `__TONGUE_n__` tokens before upload; each result is unmasked and must pass arg parity, plural-category, glossary and `$meta.maxLength` checks (one automatic retry; failures are reported and exit 1).
4. **Remove** keys deleted from the source in every target dictionary.
5. **Push** sources + results so the web editor stays in sync; the lock stores the sync cursor.

## Configuration
```js
export default {
  locales: ['en', 'de', 'fr'],
  defaultLocale: 'en',
  messages: './messages/{locale}.json',
  translate: { glossary: './glossary.json', context: 'B2B invoicing app', maxChars: 200000 },
  cloud: {
    projectId: 'prj_…',                       // written by `tongue link`
    files: ['./locales/{locale}/*.json'],     // optional: extra/other dictionary layouts (JSON or TS)
    // baseURL: 'https://www.loomlocale.com/api/v1',
  },
};
```

Dictionaries can be one file per locale (`messages/en.json`), per-locale folders (`locales/en/*.json`, file name = first key segment) or TS modules exporting a static object literal (`export default { … } as const`).

## Pricing
Billable characters = source characters × target languages. Pay-as-you-go is **£25 per 1M characters**; plan allowances are consumed first. The wizard and `tongue update --dry-run` print an estimate before anything is sent.

## Conflicts
If a string was edited both locally and on loomlocale.com, interactive runs ask which to keep; `--ci` fails unless `--prefer local|remote` is given.

## CI
Set `LOOMLOCALE_TOKEN` (create one at loomlocale.com → Settings → Tokens) and run `npx tongue update --ci`. See [`examples/github-action/loomlocale.yml`](../examples/github-action/loomlocale.yml).

## Review flow
`tongue translate --review` (default in CI) writes `<locale>.review.json` next to your dictionaries; `tongue translate --accept` applies them and updates the lock.

## Still want BYO OpenAI?
Stay on `next-tongue@0.9` — see [Migrating to 1.0](migrating-to-1.0.md).
