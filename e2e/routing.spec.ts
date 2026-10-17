import { test, expect } from '@playwright/test';

test('localized pathname /de/ueber-uns serves about (#32)', async ({
  page,
}) => {
  await page.goto('/de/ueber-uns');
  await expect(page.getByTestId('about-title')).toHaveText('Über uns');
});

test('Link href uses localized pathname (#32)', async ({ page }) => {
  await page.goto('/de');
  const link = page.getByTestId('about-link');
  await expect(link).toHaveAttribute('href', '/de/ueber-uns');
  await link.click();
  await expect(page).toHaveURL(/\/de\/ueber-uns\/?$/);
  await expect(page.getByTestId('about-title')).toHaveText('Über uns');
});

test('English about stays /en/about (#32)', async ({ page }) => {
  await page.goto('/en/about');
  await expect(page.getByTestId('about-title')).toHaveText('About us');
});
