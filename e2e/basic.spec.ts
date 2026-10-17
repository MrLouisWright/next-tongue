import { test, expect } from '@playwright/test';

test('basic example renders English', async ({ page }) => {
  await page.goto('/en');
  await expect(page.locator('h1')).toHaveText('Hello, Ada!');
  await expect(page.locator('p')).toContainText('basic next-tongue example');
});

test('basic example renders German', async ({ page }) => {
  await page.goto('/de');
  await expect(page.locator('h1')).toHaveText('Hallo, Ada!');
});
