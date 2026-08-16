import { Barlow, Barlow_Condensed } from 'next/font/google';
import '@/styles/industry.css';
import '@/styles/marketing.css';

/**
 * Industry styling for the per-player share pages.
 *
 * These live under /m/[matchId]/ rather than in the (marketing) group because
 * the group already owns no route beginning /m/ — putting them there would
 * collide with the scorecard at app/m/[matchId]. So the stylesheets and fonts
 * are wired up here instead.
 *
 * Deliberately no nav or footer: this page exists to be opened from a link in
 * a group chat and read in three seconds. Its own CTAs go to the scorecard and
 * the career record, which is the whole journey it needs to offer.
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

export default function PlayerMatchLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${barlow.variable} ${barlowCondensed.variable} oi-root`}>{children}</div>;
}
