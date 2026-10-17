# migrate-next-intl fixture (#31)

Synthetic next-intl-shaped app for measuring `tongue migrate next-intl`.

```bash
# From repo root (dry-run against a copy):
cp -R fixtures/migrate-next-intl /tmp/migrate-demo
pnpm --filter next-tongue exec tongue migrate next-intl --cwd /tmp/migrate-demo --out report.json
```

Expect: client `useTranslations` → `useT`, locale-in-scope `getTranslations` → `getT(locale, …)`, bare `getTranslations` → `TODO(tongue)`, `createNextIntlPlugin` → `withTongue`.
