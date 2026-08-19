import type { Route } from 'next';

/** The marketing sections, in nav order. Typed to ensure links exist. */
export const MARKETING_LINKS: ReadonlyArray<{ href: Route; label: string }> = [
  { href: '/app', label: 'The app' },
  { href: '/formats', label: 'Formats' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/open-source', label: 'Open source' },
  { href: '/faq', label: 'FAQ' },
];

/** Legal/admin links required for footer and app stores. */
export const FOOTER_ONLY_LINKS: ReadonlyArray<{ href: Route; label: string }> = [
  { href: '/privacy', label: 'Privacy' },
  // Account deletion link required by Play Store.
  { href: '/delete-account', label: 'Delete account' },
];
