import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable typed routes so we get autocomplete on /m/[matchId] etc.
  experimental: {
    typedRoutes: true,
  },

  // Keep server-only packages out of the client bundle
  serverExternalPackages: ['postgres'],

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
