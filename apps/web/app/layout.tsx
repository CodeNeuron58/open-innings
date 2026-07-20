import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
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
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
