import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/src/**/*.test.ts',
      'examples/og-email/lib/**/*.test.ts',
      'examples/og-email/lib/**/*.test.tsx',
      'test/**/*.test.ts',
    ],
    environment: 'node',
    setupFiles: ['./test/setup-webcrypto.ts'],
  },
});
