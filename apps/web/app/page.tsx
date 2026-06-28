import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-12 py-16">
      <section className="flex flex-col items-center gap-4 text-center">
        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          v0.1 · in development
        </span>
        <h1 className="max-w-3xl text-balance text-5xl font-bold tracking-tight sm:text-6xl">
          Free cricket scoring.
          <br />
          <span className="text-primary">Forever.</span>
        </h1>
        <p className="max-w-2xl text-balance text-lg text-muted-foreground">
          Ball-by-ball scoring, live public scorecards, player database, tournaments.
          Built by the community, funded by donations. Like Lichess — but for cricket.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Start scoring
          </Link>
          <Link
            href="https://github.com/open-innings/open-innings"
            className="inline-flex h-11 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            View on GitHub →
          </Link>
        </div>
      </section>

      <section className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
        <FeatureCard
          title="Ball-by-ball"
          body="Mobile-first scorer. One-handed usable on the boundary. Undo any ball."
        />
        <FeatureCard
          title="Public scorecards"
          body="Share a link on WhatsApp. No login to view. Auto-refreshes live."
        />
        <FeatureCard
          title="Player database"
          body="Track every player across teams, tournaments, seasons. Career stats."
        />
      </section>

      <footer className="text-center text-xs text-muted-foreground">
        <p>
          AGPL-3.0 · Open source · <Link href="/donate" className="underline">Donate</Link> ·{' '}
          <Link href="/docs/architecture" className="underline">
            Architecture
          </Link>
        </p>
      </footer>
    </main>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
