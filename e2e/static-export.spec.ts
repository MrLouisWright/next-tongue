import { test, expect } from '@playwright/test';

test('static-export serves English HTML', async ({ page }) => {
  await page.goto('/en');
  await expect(page.locator('h1')).toHaveText('Static export — Ada');
  await expect(page.locator('p')).toContainText('output: export');
});

test('static-export serves German HTML', async ({ page }) => {
  await page.goto('/de');
  await expect(page.locator('h1')).toHaveText('Statischer Export — Ada');
});
