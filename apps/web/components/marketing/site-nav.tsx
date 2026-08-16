'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BlueprintLink } from './blueprint';
import { MARKETING_LINKS } from './links';

/**
 * The site header.
 *
 * A client component only so `usePathname` can mark the current section — the
 * design underlines it with an inset accent rule. The alternative was passing
 * a `current` prop from every page, which would mean the nav could not live in
 * the shared layout. It still server-renders, so there is no flash and the
 * hydration cost is one small tree.
 */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="oi-nav">
      <Link href="/" className="oi-brand">
        OPEN INNINGS
      </Link>

      <div className="oi-navlinks">
        {MARKETING_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn('oi-nl', pathname === link.href && 'oi-nl-on')}
            aria-current={pathname === link.href ? 'page' : undefined}
          >
            {link.label}
          </Link>
        ))}
      </div>

      <BlueprintLink href="/app" className="btn btn-primary oi-nav-cta">
        Get the app
      </BlueprintLink>
    </nav>
  );
}
