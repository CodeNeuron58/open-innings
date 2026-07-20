import Link from 'next/link';
import { Check } from 'lucide-react';
import { Logo, LogoMark } from '@/components/ui';

/**
 * Shared frame for login/signup: brand panel on desktop, form card always.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel — desktop only */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-scoreboard p-10 text-scoreboard-text lg:flex">
        <div
          className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary/25 blur-3xl"
          aria-hidden
        />
        <div
          className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-pitch/20 blur-3xl"
          aria-hidden
        />
        <Link href="/" className="relative">
          <Logo textClassName="text-scoreboard-text" />
        </Link>
        <div className="relative max-w-md">
          <LogoMark className="mb-6 h-12 w-12" />
          <h2 className="text-balance text-3xl font-bold leading-tight">
            Every club deserves a proper scorebook.
          </h2>
          <ul className="mt-6 space-y-3 text-sm text-scoreboard-muted">
            {[
              'Ball-by-ball scoring, one-handed on your phone',
              'Live scorecards your whole team can follow',
              'Free forever — no ads, no premium tier',
              'Open source, community-owned, donation-funded',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-scoreboard-muted">
          AGPL-3.0 · like Lichess, but for cricket
        </p>
      </aside>

      {/* Form side */}
      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-block lg:hidden">
            <Logo />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mb-8 mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
