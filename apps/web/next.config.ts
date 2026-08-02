import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable typed routes so we get autocomplete on /m/[matchId] etc.
  typedRoutes: true,

  // Keep server-only packages out of the client bundle
  serverExternalPackages: ['postgres'],

  // Workspace packages ship raw TypeScript (no build step) so the same source
  // is consumed by Next.js here and by Metro in apps/mobile.
  transpilePackages: ['@open-innings/scoring'],

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
