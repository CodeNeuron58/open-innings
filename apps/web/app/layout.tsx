import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * Where this site lives, for absolute URLs in metadata.
 *
 * `APP_URL` first, and the ordering is the point. Anything prefixed
 * `NEXT_PUBLIC_` is **inlined at build time** — Next replaces it with a
 * literal string during compilation — so changing that config var on a
 * running app does nothing until the next rebuild. That is a quiet failure:
 * the dashboard shows the new value, the app keeps serving the old one, and
 * the only visible symptom is share-card images pointing at the wrong host.
 *
 * This is only read on the server, so it does not need to be public at all.
 * `APP_URL` is read at runtime, which means a domain change takes effect on
 * a dyno restart instead of a redeploy.
 *
 * `NEXT_PUBLIC_APP_URL` is still honoured so existing deployments do not
 * break, and localhost is the last resort for a dev machine with neither.
 */
const APP_URL = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'Open Innings — Free cricket scoring, forever',
    template: '%s · Open Innings',
  },
  description:
    'Free, open-source ball-by-ball cricket scoring. Live scorecards, player database, tournaments. Free forever.',
  applicationName: 'Open Innings',
  keywords: ['cricket', 'scoring', 'live score', 'tournament', 'free', 'open source'],
  authors: [{ name: 'Open Innings contributors' }],
  openGraph: {
    type: 'website',
    siteName: 'Open Innings',
    title: 'Open Innings — Free cricket scoring, forever',
    description:
      'Ball-by-ball cricket scoring. Live scorecards, player stats, tournaments. Free forever, donation-funded.',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#166448' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1f19' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
