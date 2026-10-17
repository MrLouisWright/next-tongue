import type { NextConfig } from 'next';
import { withTongue } from 'next-tongue/next';

/** Early check (#15): cacheComponents + output export on current 16.x */
const nextConfig: NextConfig = {
  cacheComponents: true,
  output: 'export',
  ...({ partialPrefetching: true } as object),
};

export default withTongue(nextConfig);
