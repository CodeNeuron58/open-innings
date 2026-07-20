import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/local';
import { signOutAction } from '@/lib/auth/actions';
import { NavLinks } from '@/components/NavLinks';
import { Logo, ButtonLink } from '@/components/ui';

export async function Nav() {
  const user = await getCurrentUser();
  const initial = (user?.email?.[0] ?? '?').toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/75">
      <nav className="container flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" aria-label="Open Innings home">
            <Logo />
          </Link>
          <NavLinks />
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span
                className="hidden max-w-[16rem] truncate text-sm text-muted-foreground sm:inline"
                title={user.email}
              >
                {user.email}
              </span>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground sm:hidden">
                {initial}
              </span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </form>
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink href="/signup" size="sm">
                Get started
              </ButtonLink>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
