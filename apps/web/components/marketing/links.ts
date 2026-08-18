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

/**
 * Links that belong in the footer but not the nav.
 *
 * Privacy is a legal document, not a section of the site — nobody browses to
 * it, they go looking for it, and the footer is where people look. It is also
 * the URL Google Play requires before it will publish, so it has to exist at a
 * stable path and be reachable from every page.
 */
export const FOOTER_ONLY_LINKS: ReadonlyArray<{ href: Route; label: string }> = [
  { href: '/privacy', label: 'Privacy' },
];
