import { Barlow, Barlow_Condensed } from 'next/font/google';
import { SiteNav } from '@/components/marketing/site-nav';
import { SiteFooter } from '@/components/marketing/site-footer';
import '@/styles/industry.css';
import '@/styles/marketing.css';
import '@/styles/phone-screen.css';

/**
 * The public marketing site.
 *
 * Everything under this group is static and unauthenticated. The app itself is
 * Android — this exists to explain it, not to run it.
 *
 * Both stylesheets are imported here rather than in the root layout on
 * purpose: the App Router splits CSS per route segment, so the Industry
 * design system's `:root` tokens only apply to these pages. `/m/[matchId]`
 * (the public scorecard, and the whole share loop) keeps the original theme
 * and is untouched by this redesign.
 *
 * Fonts come from next/font rather than the design system's Google Fonts
 * `@import` — self-hosted, preloaded, no render-blocking request and no
 * layout shift. `.oi-root` re-points the `--font-*` tokens at these two
 * variables so the vendored CSS needs no edits.
 */

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-barlow',
  display: 'swap',
});

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-barlow-condensed',
  display: 'swap',
});

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${barlow.variable} ${barlowCondensed.variable} oi-root`}>
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
