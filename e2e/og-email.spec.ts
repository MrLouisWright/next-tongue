import { test, expect } from '@playwright/test';

test('opengraph-image returns PNG for en and ar', async ({ request }) => {
  for (const locale of ['en', 'ar']) {
    const res = await request.get(`/${locale}/opengraph-image`);
    expect(res.status(), locale).toBe(200);
    expect(res.headers()['content-type'] ?? '').toMatch(/image\/png/);
    const body = await res.body();
    expect(body.byteLength).toBeGreaterThan(1000);
  }
});

test('twitter-image returns PNG', async ({ request }) => {
  const res = await request.get('/de/twitter-image');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type'] ?? '').toMatch(/image\/png/);
});

test('welcome-email API uses stored locale (not headers)', async ({
  request,
}) => {
  const res = await request.post('/api/welcome-email', {
    data: {
      locale: 'ar',
      name: 'Ada',
      createdAt: '2024-01-15T12:00:00Z',
      timeZone: 'UTC',
    },
  });
  expect(res.status()).toBe(200);
  const json = (await res.json()) as {
    subject: string;
    html: string;
  };
  expect(json.subject).toContain('أهلاً');
  expect(json.html).toContain('dir="rtl"');
});
