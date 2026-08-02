import Link from 'next/link';
import { Zap, Share2, Users, Shield, Trophy, GitFork, Check, X, Github, Heart } from 'lucide-react';
import { Logo, ButtonLink, Badge, LiveBadge, Card } from '@/components/ui';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Marketing nav */}
      <header className="border-border bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
        <nav className="container flex h-14 items-center justify-between">
          <Link href="/" aria-label="Open Innings home">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/open-innings/open-innings"
              className="text-muted-foreground hover:bg-accent hover:text-foreground hidden items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:inline-flex"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
            <ButtonLink href="/login" variant="ghost" size="sm">
              Sign in
            </ButtonLink>
            <ButtonLink href="/signup" size="sm">
              Start scoring
            </ButtonLink>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="container grid items-center gap-10 py-16 lg:grid-cols-2 lg:gap-16 lg:py-24">
          <div className="flex flex-col items-start gap-5">
            <Badge variant="success">
              <Heart className="h-3 w-3" /> Free forever · open source · AGPL-3.0
            </Badge>
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              The cricket scoring app that will never charge you.
            </h1>
            <p className="text-muted-foreground max-w-xl text-balance text-lg">
              Ball-by-ball scoring, live shareable scorecards, player careers, teams and tournaments
              — community-owned and donation-funded, like Lichess. No ads, no premium tier, no
              lock-in. Ever.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href="/signup" size="lg">
                Score your first match
              </ButtonLink>
              <ButtonLink
                href="https://github.com/open-innings/open-innings"
                variant="outline"
                size="lg"
              >
                <Github className="h-4 w-4" />
                Star on GitHub
              </ButtonLink>
            </div>
            <p className="text-muted-foreground text-xs">
              Self-hostable · your data is yours · export anytime
            </p>
          </div>

          <ScoreboardMockup />
        </section>

        {/* Comparison */}
        <section className="border-border bg-card/60 border-y">
          <div className="container py-16">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight">
                Everything the paid apps do. Nothing they charge for.
              </h2>
              <p className="text-muted-foreground mt-3">
                Commercial scoring apps monetise your club with subscriptions, ads and paywalled
                stats. Open Innings is built the Lichess way — the whole product is free, for
                everyone, forever.
              </p>
            </div>
            <div className="mx-auto max-w-3xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-border border-b text-left">
                    <th className="text-muted-foreground py-3 pr-4 font-medium">&nbsp;</th>
                    <th className="px-4 py-3 font-semibold">Open Innings</th>
                    <th className="text-muted-foreground px-4 py-3 font-medium">Commercial apps</th>
                  </tr>
                </thead>
                <tbody>
                  <ComparisonRow feature="Ball-by-ball scoring" us={true} them="Free, with ads" />
                  <ComparisonRow
                    feature="Live public scorecards"
                    us={true}
                    them="Free tier limits"
                  />
                  <ComparisonRow feature="Full career stats" us={true} them="Often premium" />
                  <ComparisonRow
                    feature="Tournaments & leaderboards"
                    us="v0.2"
                    them="Premium tiers"
                  />
                  <ComparisonRow feature="No ads" us={true} them={false} />
                  <ComparisonRow
                    feature="Open source — audit & contribute"
                    us={true}
                    them={false}
                  />
                  <ComparisonRow feature="Self-host with your club's data" us={true} them={false} />
                  <ComparisonRow feature="Price" us="Free forever" them="Subscriptions" />
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="container py-16">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">Built for the boundary rope</h2>
            <p className="text-muted-foreground mt-3">
              Designed to be used one-handed on a phone, standing at square leg.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<Zap className="h-5 w-5" />}
              title="Ball-by-ball scorer"
              body="Big thumb-friendly keys for every outcome — runs, boundaries, extras, wickets. Undo any ball; events are the source of truth."
            />
            <FeatureCard
              icon={<Share2 className="h-5 w-5" />}
              title="Live public scorecards"
              body="One link on the team WhatsApp group. No login, no app install — the scorecard refreshes itself."
            />
            <FeatureCard
              icon={<Users className="h-5 w-5" />}
              title="Player careers"
              body="Every innings counts. Runs, strike rates, wickets and economy tracked across teams and seasons."
            />
            <FeatureCard
              icon={<Shield className="h-5 w-5" />}
              title="Teams & squads"
              body="Build squads once, pick XIs per match. Home grounds, short names, the lot."
            />
            <FeatureCard
              icon={<Trophy className="h-5 w-5" />}
              title="Tournaments"
              body="Round-robin, knockout and group stages with leaderboards — landing in v0.2."
            />
            <FeatureCard
              icon={<GitFork className="h-5 w-5" />}
              title="Yours to run"
              body="AGPL-licensed. Fork it, self-host it for your league, and export your data whenever you like."
            />
          </div>
        </section>

        {/* Community CTA */}
        <section className="border-border bg-primary text-primary-foreground border-t">
          <div className="container flex flex-col items-center gap-5 py-16 text-center">
            <h2 className="max-w-2xl text-balance text-3xl font-bold tracking-tight">
              Built by cricket lovers. Owned by everyone.
            </h2>
            <p className="text-primary-foreground/80 max-w-xl text-balance">
              Chess got Lichess. Cricket gets Open Innings. Run entirely on donations, with every
              expense published transparently.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <ButtonLink
                href="/signup"
                size="lg"
                className="bg-card text-foreground hover:bg-card/90"
              >
                Create a free account
              </ButtonLink>
              <ButtonLink
                href="https://opencollective.com/open-innings"
                variant="outline"
                size="lg"
                className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground bg-transparent"
              >
                <Heart className="h-4 w-4" />
                Donate
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-border border-t py-8">
        <div className="text-muted-foreground container flex flex-col items-center justify-between gap-4 text-sm sm:flex-row">
          <Logo textClassName="text-sm" />
          <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <span>AGPL-3.0</span>
            <a
              href="https://github.com/open-innings/open-innings"
              className="hover:text-foreground"
            >
              GitHub
            </a>
            <a href="https://opencollective.com/open-innings" className="hover:text-foreground">
              Donate
            </a>
            <Link href="/docs/architecture" className="hover:text-foreground">
              Architecture
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Static mock of the live scorer — shows the product before signup. */
function ScoreboardMockup() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div
        className="from-primary/20 via-pitch/20 absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br to-transparent blur-2xl"
        aria-hidden
      />
      <Card className="border-scoreboard-border bg-scoreboard text-scoreboard-text shadow-card-hover overflow-hidden">
        <div className="border-scoreboard-border flex items-center justify-between border-b px-5 py-3">
          <p className="text-sm font-semibold">Sunday League · Final</p>
          <LiveBadge />
        </div>
        <div className="px-5 py-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-scoreboard-muted text-sm">Boundary CC</p>
              <p className="text-5xl font-bold tabular-nums tracking-tight">
                142<span className="text-scoreboard-muted">/</span>3
              </p>
            </div>
            <div className="text-scoreboard-muted text-right text-sm">
              <p className="tabular-nums">16.4 ov · CRR 8.52</p>
              <p className="text-scoreboard-accent mt-1">Need 19 off 20</p>
            </div>
          </div>
          <div className="mt-6 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">▸ R. Sharma</span>
              <span className="text-scoreboard-muted tabular-nums">
                68 (41) · 4×6 <span className="text-scoreboard-text">·</span> 5×4
              </span>
            </div>
            <div className="text-scoreboard-muted flex justify-between">
              <span>K. Perera</span>
              <span className="tabular-nums">24 (19)</span>
            </div>
          </div>
        </div>
        <div className="border-scoreboard-border flex items-center gap-1.5 border-t px-5 py-3">
          <span className="text-scoreboard-muted mr-1 text-xs uppercase tracking-wide">
            This over
          </span>
          <MockBall label="1" />
          <MockBall label="4" className="bg-four text-four-foreground" />
          <MockBall label="•" />
          <MockBall label="6" className="bg-six text-six-foreground" />
          <MockBall label="wd" className="bg-extra/20 text-extra" />
          <MockBall label="2" />
        </div>
      </Card>
    </div>
  );
}

function MockBall({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={`bg-scoreboard-panel inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums ${className ?? ''}`}
    >
      {label}
    </span>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card className="hover:shadow-card-hover p-6 transition-shadow">
      <span className="bg-accent text-accent-foreground mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md">
        {icon}
      </span>
      <h3 className="mb-1.5 font-semibold">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
    </Card>
  );
}

function ComparisonRow({
  feature,
  us,
  them,
}: {
  feature: string;
  us: boolean | string;
  them: boolean | string;
}) {
  return (
    <tr className="border-border/60 border-b">
      <td className="py-3 pr-4 font-medium">{feature}</td>
      <td className="px-4 py-3">
        {us === true ? (
          <span className="text-primary inline-flex items-center gap-1.5 font-medium">
            <Check className="h-4 w-4" /> Included
          </span>
        ) : (
          <span className="text-primary font-medium">{us}</span>
        )}
      </td>
      <td className="text-muted-foreground px-4 py-3">
        {them === true ? (
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4" /> Included
          </span>
        ) : them === false ? (
          <span className="inline-flex items-center gap-1.5">
            <X className="h-4 w-4" /> No
          </span>
        ) : (
          them
        )}
      </td>
    </tr>
  );
}
