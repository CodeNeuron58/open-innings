'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Swords, Users, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/matches', label: 'Matches', icon: Swords },
  { href: '/teams', label: 'Teams', icon: Shield },
  { href: '/players', label: 'Players', icon: Users },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop top-bar links with active states. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <div className="hidden items-center gap-1 md:flex">
      {links.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

/** App-style bottom tab bar — the primary navigation on phones. */
export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav className="safe-bottom border-border bg-card/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:hidden">
      <div className="grid grid-cols-4">
        {links.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
