import { test, expect } from '@playwright/test';

test('basic example renders English at / (as-needed)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Hello, Ada!');
  await expect(page.locator('p')).toContainText('basic next-tongue example');
});

test('basic example renders German', async ({ page }) => {
  await page.goto('/de');
  await expect(page.locator('h1')).toHaveText('Hallo, Ada!');
});

test('canonical redirect: /en → / (308)', async ({ request }) => {
  const res = await request.get('/en', { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()['location']).toMatch(/\/$/);
});

test('Accept-Language de redirects bare path to /de', async ({ request }) => {
  const res = await request.get('/', {
    maxRedirects: 0,
    headers: { 'accept-language': 'de,en;q=0.8' },
  });
  // as-needed: non-default → 307 to /de
  expect(res.status()).toBe(307);
  expect(res.headers()['location']).toMatch(/\/de\/?$/);
});

test('locale cookie SameSite=Lax is set', async ({ request }) => {
  const res = await request.get('/de', { maxRedirects: 0 });
  const setCookie = res.headers()['set-cookie'] ?? '';
  expect(setCookie).toMatch(/TONGUE_LOCALE=de/i);
  expect(setCookie.toLowerCase()).toMatch(/samesite=lax/);
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
