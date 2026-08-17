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
      /*
       * Plain HTTP → HTTPS.
       *
       * Nothing else does this. Next does not redirect by default, and
       * Cloudflare cannot help because the DNS records are unproxied — which
       * they must be, or Heroku could not issue the certificate. So typing
       * "openinnings.com" reached the app unencrypted and the browser said
       * "Not secure", which on a page carrying a login form is not a cosmetic
       * problem.
       *
       * Heroku terminates TLS at the router and forwards the original scheme
       * in `x-forwarded-proto`, so that header is the only way the dyno can
       * know. It is absent locally, so this never fires in development.
       *
       * Lands on the apex rather than echoing the host back, which also
       * canonicalises anyone arriving on the herokuapp hostname.
       */
      {
        source: '/:path*',
        has: [{ type: 'header', key: 'x-forwarded-proto', value: 'http' }],
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
          /*
           * Tell browsers to stop trying HTTP at all.
           *
           * The redirect above fixes the request that has already been sent
           * in the clear; this stops the next one being sent that way. Both
           * are needed — a redirect still leaks the first request.
           *
           * One year, subdomains included. Deliberately **not** `preload`:
           * that bakes the domain into a list shipped inside browsers, and
           * getting off it takes months. Worth doing once the domain is
           * settled, not on its first day.
           */
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
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
