import { test, expect } from '@playwright/test';

test('cache-components renders English shell', async ({ page }) => {
  await page.goto('/en');
  await expect(page.locator('h1')).toHaveText('Welcome, Ada!');
  await expect(page.locator('main')).toContainText('3 messages');
});

test('cache-components renders German shell', async ({ page }) => {
  await page.goto('/de');
  await expect(page.locator('h1')).toHaveText('Willkommen, Ada!');
});
