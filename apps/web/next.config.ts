import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@alibi/protocol', '@alibi/runtime'],
};

export default nextConfig;
