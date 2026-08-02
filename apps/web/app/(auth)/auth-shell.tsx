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
      <aside className="bg-scoreboard text-scoreboard-text relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        <div
          className="bg-primary/25 absolute -right-32 -top-32 h-96 w-96 rounded-full blur-3xl"
          aria-hidden
        />
        <div
          className="bg-pitch/20 absolute -bottom-40 -left-24 h-96 w-96 rounded-full blur-3xl"
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
          <ul className="text-scoreboard-muted mt-6 space-y-3 text-sm">
            {[
              'Ball-by-ball scoring, one-handed on your phone',
              'Live scorecards your whole team can follow',
              'Free forever — no ads, no premium tier',
              'Open source, community-owned, donation-funded',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-scoreboard-muted relative text-xs">
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
          <p className="text-muted-foreground mb-8 mt-1.5 text-sm">{subtitle}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
