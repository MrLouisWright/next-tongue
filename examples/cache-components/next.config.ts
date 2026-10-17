import type { NextConfig } from 'next';
import { withTongue } from 'next-tongue/next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Next 16.4 warns until this is set; top-level key when supported.
  ...({ partialPrefetching: true } as object),
};

export default withTongue(nextConfig);
