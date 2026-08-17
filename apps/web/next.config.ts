import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable typed routes so we get autocomplete on /m/[matchId] etc.
  typedRoutes: true,

  // Keep server-only packages out of the client bundle
  serverExternalPackages: ['postgres'],

  // Workspace packages ship raw TypeScript (no build step) so the same source
  // is consumed by Next.js here and by Metro in apps/mobile.
  transpilePackages: ['@open-innings/scoring', '@open-innings/shared'],

  /**
   * One canonical hostname.
   *
   * `www.openinnings.com` and `openinnings.com` both resolve to this app, so
   * without this every page exists at two addresses — which splits search
   * ranking, and means a shared scorecard link can arrive in two forms that
   * look like different pages.
   *
   * The apex wins rather than www, and that is not a style preference:
   * AdMob crawls `app-ads.txt` from the **bare** domain named in the Play
   * listing, and it has to be reachable at exactly `openinnings.com/app-ads.txt`.
   *
   * Permanent, because the choice is not going to change and a 308 lets
   * browsers and crawlers stop asking.
   */
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.openinnings.com' }],
        destination: 'https://openinnings.com/:path*',
        permanent: true,
      },
    ];
  },

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
