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

test('server action returns translated error with JS (#26)', async ({
  page,
}) => {
  await page.goto('/de/contact');
  await page.getByTestId('email').fill('not-an-email');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('error')).toHaveText(
    'Gib eine gültige E-Mail ein.',
  );
});

test('server action returns translated error without JS (#26)', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/de/contact');
  await page.getByTestId('email').fill('not-an-email');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('error')).toHaveText(
    'Gib eine gültige E-Mail ein.',
  );
  await context.close();
});