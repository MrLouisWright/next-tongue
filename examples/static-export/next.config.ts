import type { NextConfig } from 'next';
import { withTongue } from 'next-tongue/next';

const nextConfig: NextConfig = {
  output: 'export',
};

export default withTongue(nextConfig);
