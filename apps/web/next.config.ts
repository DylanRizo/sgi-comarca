import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@sgi/contracts', '@sgi/ui'],
  typedRoutes: true,
};

export default nextConfig;
