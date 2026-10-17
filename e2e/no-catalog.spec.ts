import { test, expect } from '@playwright/test';

/**
 * #20 — message catalogs must not appear in HTML / RSC payload.
 * Server-rendered strings are fine; raw JSON message maps are not.
 */
test.describe('no message catalog in HTML', () => {
  test.use({ baseURL: 'http://127.0.0.1:3102' });

  test('cache-components HTML has translated text but no catalog JSON', async ({
    page,
  }) => {
    const res = await page.goto('/en');
    expect(res?.ok()).toBeTruthy();
    const html = await page.content();
    expect(html).toContain('Welcome, Ada!');
    // Catalog-shaped payloads (next-intl style) should not appear
    expect(html).not.toMatch(/"home"\s*:\s*\{\s*"title"/);
    expect(html).not.toMatch(/"messages"\s*:\s*\{\s*"home"/);
  });
});
