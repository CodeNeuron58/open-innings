import type { Route } from 'next';

/**
 * The marketing sections, in nav order.
 *
 * One list feeding both the header and the footer, so they can never drift.
 * Typed as `Route` because `typedRoutes` is on in next.config.ts — a link to a
 * page that doesn't exist is a compile error, not a 404 someone finds later.
 */
export const MARKETING_LINKS: ReadonlyArray<{ href: Route; label: string }> = [
  { href: '/app', label: 'The app' },
  { href: '/formats', label: 'Formats' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/open-source', label: 'Open source' },
  { href: '/faq', label: 'FAQ' },
];
