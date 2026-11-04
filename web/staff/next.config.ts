import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@albarakah/ui', '@albarakah/domain'],
};

export default nextConfig;
