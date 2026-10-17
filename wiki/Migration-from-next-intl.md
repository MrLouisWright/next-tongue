> 📄 Mirrors [`docs/migration/next-intl.md`](https://github.com/MrLouisWright/next-tongue/blob/main/docs/migration/next-intl.md) in the main repo — the repo version is canonical.

# Migrating from next-intl

> **Status: partial.** `tongue migrate next-intl` rewrites client `useTranslations` → `useT`, common imports, and annotates server `getTranslations` with `TODO(tongue)` when locale is missing ([#31](https://github.com/MrLouisWright/next-tongue/issues/31)). Full locale-threading + report measured on 3 OSS apps remains post-1.0. Message files are reusable as-is. See [ROADMAP](Roadmap).

```bash
npx tongue migrate next-intl --dry-run
npx tongue migrate next-intl
```

## Mapping (the future codemod will follow it)

| next-intl | next-tongue | Future codemod (post-1.0) |
|---|---|---|
| `i18n/routing.ts` `defineRouting({...})` | `tongue.config.ts` `defineConfig({...})` (`localePrefix` → `routing.prefix`, `pathnames` kept) | ✅ |
| `createNextIntlPlugin()` in next.config | `withTongue()` | ✅ |
| `middleware.ts`/`proxy.ts` with `createMiddleware(routing)` | `proxy.ts` with `createProxy()` | ✅ |
| `i18n/request.ts` `getRequestConfig` | removed (messages are compiled) | ✅ (custom logic flagged) |
| `NextIntlClientProvider messages={...}` | `TongueProvider locale={locale}` | ✅ |
| `useTranslations('ns')` | `useT('ns')` | ✅ |
| `await getTranslations('ns')` | `await getT(locale, 'ns')` — **needs locale** | ⚠️ inserts `locale` if `params` is in scope, else adds `TODO(tongue)` |
| `getTranslations({ locale, namespace })` | `getT(locale, namespace)` | ✅ |
| `setRequestLocale(locale)` | removed (not needed) | ✅ |
| `getLocale()` / `useLocale()` | params / `useLocale()` from `next-tongue/client` | ⚠️ / ✅ |
| `useFormatter()` / `getFormatter()` | `useFormat()` / `getFormat(locale)` | ✅ |
| `createNavigation(routing)` exports | `next-tongue/navigation` imports | ✅ |
| `t.rich`, `t.markup` | `t.rich` (markup → rich with string tags) | ✅ / ⚠️ |
| `t.raw`, `t.has` | `t.raw` not supported (use structured keys); `t.has` → `t.has` | ⚠️ |
| `useExtracted()` / `getExtracted()` (experimental, inline source strings) | not converted; flagged with `TODO(tongue)` — next-tongue is key-based | ❌ |
| `global.d.ts` `AppConfig` augmentation | deleted (generated types) | ✅ |

Messages: next-intl JSON is already nested ICU (`.po` catalogs from `useExtracted` are not supported), so files are reused as-is. `tongue check` reports any key containing `.` or messages outside next-tongue's [supported ICU subset](ICU-Messages).

## Manual steps
1. Pass `locale` into server components, `generateMetadata`, actions (`action.bind(null, locale)`) and utilities; `createTranslator(locale)` reduces repetition.
2. Remove `next-intl` and run `npx tongue check`.
3. If you relied on `getLocale()` from headers inside cached components, that code now becomes static — that is the point.
