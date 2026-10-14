# Testing

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

## Unit tests (Vitest/Jest)

```ts
import { createTestT } from 'next-tongue/testing';

const t = createTestT('de', 'home');
expect(t('inbox', { count: 2 })).toBe('2 Nachrichten');
```
`createTestT` uses the same compiled modules as the app (run `tongue extract --types-only` or the Vitest plugin `next-tongue/testing/vite` to compile first).

## Component tests (Testing Library)

```tsx
import { render, screen } from '@testing-library/react';
import { TongueTestProvider } from 'next-tongue/testing';

render(<TongueTestProvider locale="de"><InboxBadge count={1} /></TongueTestProvider>);
expect(screen.getByText('1 Nachricht')).toBeInTheDocument();
```
Pass `keysOnly` to render keys instead of text (`home.inbox`) for locale-independent snapshot tests.

## Async server components

Test the logic by calling the component function and rendering the result, or prefer e2e for RSC.

## E2E (Playwright)

Test each locale's URL directly (`/de/about`) and test the proxy separately with `Accept-Language` headers:
```ts
test('redirects German browsers', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'de-DE' });
  const page = await ctx.newPage();
  await page.goto('/about');
  await expect(page).toHaveURL(/\/de\/ueber-uns$/);
});
```

## CI

Run `tongue check` before tests; it is faster than a build and catches most i18n regressions.
