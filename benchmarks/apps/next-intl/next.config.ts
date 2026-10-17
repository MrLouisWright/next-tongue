import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin({
  requestConfig: './i18n/request.ts',
  experimental: {
    messages: {
      path: './messages',
      format: 'json',
      locales: 'infer',
      precompile: true,
    },
  },
});

const nextConfig: NextConfig = {
  // Isolate from monorepo Turbopack quirks for a fair measure
};

export default withNextIntl(nextConfig);
