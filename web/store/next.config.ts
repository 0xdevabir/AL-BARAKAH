import type { NextConfig } from 'next';

const mobile = process.env.BUILD_TARGET === 'mobile';

const nextConfig: NextConfig = {
  output: mobile ? 'export' : 'standalone',
  transpilePackages: ['@albarakah/ui', '@albarakah/domain'],
  images: { unoptimized: mobile },
};

export default nextConfig;
