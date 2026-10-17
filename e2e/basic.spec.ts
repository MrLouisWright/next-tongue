import { test, expect } from '@playwright/test';

test('basic example renders English at / (as-needed)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Hello, Ada!');
  await expect(page.getByText('basic next-tongue example')).toBeVisible();
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

test('generateMetadata title from getT (cold worker / A8)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Home — next-tongue');
  await page.goto('/de');
  await expect(page).toHaveTitle('Start — next-tongue');
});

test('LocaleSwitcher links keep page and are accessible (#44)', async ({
  page,
}) => {
  await page.goto('/de');
  const nav = page.getByTestId('language-menu');
  await expect(nav).toHaveAttribute('aria-label', 'Language');
  const de = page.getByTestId('lang-de');
  const en = page.getByTestId('lang-en');
  await expect(de).toHaveAttribute('aria-current', 'page');
  await expect(de).toHaveAttribute('hreflang', 'de');
  await expect(de).toHaveAttribute('lang', 'de');
  await expect(en).toHaveAttribute('href', '/en');
  await en.click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('h1')).toHaveText('Hello, Ada!');
  await expect(page.getByTestId('lang-en')).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test.describe('explicit timeZone hydration (ADR 0008)', () => {
  // Browser zone differs from config UTC — shell + client must still agree.
  test.use({ timezoneId: 'America/New_York' });

  test('server and client date match; no hydration mismatch', async ({
    page,
  }) => {
    const hydrationErrors: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (
        msg.type() === 'error' &&
        (/hydrat/i.test(text) || /did not match/i.test(text))
      ) {
        hydrationErrors.push(text);
      }
    });
    page.on('pageerror', (err) => {
      if (/hydrat/i.test(err.message) || /did not match/i.test(err.message)) {
        hydrationErrors.push(err.message);
      }
    });

    await page.goto('/');
    const server = await page.getByTestId('server-date').innerText();
    const client = await page.getByTestId('client-date').innerText();
    expect(server.length).toBeGreaterThan(0);
    expect(client).toBe(server);
    // UTC noon on 15 Jan 2024 — not midnight Eastern
    expect(server).toMatch(/Jan.*15.*2024/i);
    expect(hydrationErrors).toEqual([]);
  });
});
