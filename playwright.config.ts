import { defineConfig, devices } from '@playwright/test';

const PORT_BASIC = 3101;
const PORT_CACHE = 3102;
const PORT_EXPORT = 3103;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'basic',
      testMatch: /basic\.spec\.ts/,
      use: { baseURL: `http://127.0.0.1:${PORT_BASIC}` },
    },
    {
      name: 'cache-components',
      testMatch: /cache-components\.spec\.ts/,
      use: { baseURL: `http://127.0.0.1:${PORT_CACHE}` },
    },
    {
      name: 'static-export',
      testMatch: /static-export\.spec\.ts/,
      use: { baseURL: `http://127.0.0.1:${PORT_EXPORT}` },
    },
    {
      name: 'no-catalog',
      testMatch: /no-catalog\.spec\.ts/,
      use: { baseURL: `http://127.0.0.1:${PORT_CACHE}` },
    },
  ],
  webServer: [
    {
      command: `pnpm --filter @next-tongue/example-basic exec next start --port ${PORT_BASIC}`,
      url: `http://127.0.0.1:${PORT_BASIC}/en`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm --filter @next-tongue/example-cache-components exec next start --port ${PORT_CACHE}`,
      url: `http://127.0.0.1:${PORT_CACHE}/en`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm exec serve examples/static-export/out -l ${PORT_EXPORT}`,
      url: `http://127.0.0.1:${PORT_EXPORT}/en`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
