> 📄 Mirrors [`docs/migration/next-international.md`](https://github.com/MrLouisWright/next-tongue/blob/main/docs/migration/next-international.md) in the main repo — the repo version is canonical.

# Migrating from next-international

> **Status: planned / pre-release.** Codemods ship in v0.5. See [ROADMAP](Roadmap).

```bash
npx tongue migrate next-international --write
```

| next-international | next-tongue | Automated |
|---|---|---|
| `locales/en.ts` (`export default { ... } as const`) | `messages/en.json` | ✅ (evaluates the module; functions are flagged) |
| `{name}` interpolation | ICU `{name}` (same) | ✅ |
| `key#zero/#one/#other` plural suffixes | ICU `{count, plural, =0 {…} one {…} other {…}}` | ✅ |
| `createI18nServer` / `createI18nClient` setup files | removed; `tongue.config.ts` generated from the locale map | ✅ |
| `createI18nMiddleware` | `createProxy()` in `proxy.ts` (`urlMappingStrategy: 'rewriteDefault'` → `prefix: 'as-needed'`) | ✅ |
| `I18nProviderClient locale=…` | `TongueProvider locale=…` | ✅ |
| `useI18n()` / `useScopedI18n('ns')` | `useT()` / `useT('ns')` | ✅ |
| `getI18n()` / `getScopedI18n('ns')` | `getT(locale)` / `getT(locale, 'ns')` | ⚠️ needs locale (as for next-intl) |
| `useCurrentLocale()` / `getCurrentLocale()` | `useLocale()` / params | ✅ / ⚠️ |
| `useChangeLocale()` | `<Link locale>` or `useRouter().replace(pathname, { locale })` | ⚠️ |
| `setStaticParamsLocale` | removed | ✅ |
| `getStaticParams()` | `localeParams` | ✅ |

Rich values (React nodes as params) → `t.rich` with tags; flagged for review.

