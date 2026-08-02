import Link from 'next/link';
import { Plus, Swords, Users, Shield, Radio, ArrowRight } from 'lucide-react';
import { listMatches, listPlayers, listTeams } from '@/lib/db/queries';
import { ButtonLink, Card, PageHeader, StatTile, StatusBadge, EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [matches, players, teams] = await Promise.all([
    listMatches().catch(() => []),
    listPlayers().catch(() => []),
    listTeams().catch(() => []),
  ]);

  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const liveMatches = matches.filter((m) => m.status === 'live');
  const recentMatches = matches.slice(0, 5);
  const isEmpty = matches.length === 0 && players.length === 0 && teams.length === 0;

  return (
    <div className="container py-8">
      <PageHeader
        title="Dashboard"
        description="Your club at a glance."
        action={
          <ButtonLink href="/matches/new">
            <Plus className="h-4 w-4" /> New match
          </ButtonLink>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Live now"
          value={liveMatches.length}
          hint={liveMatches.length > 0 ? 'Scoring in progress' : 'No match in progress'}
          icon={<Radio className="h-4 w-4" />}
        />
        <StatTile
          label="Matches"
          value={matches.length}
          hint="All time"
          icon={<Swords className="h-4 w-4" />}
        />
        <StatTile
          label="Teams"
          value={teams.length}
          hint="In your club"
          icon={<Shield className="h-4 w-4" />}
        />
        <StatTile
          label="Players"
          value={players.length}
          hint="In your database"
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      {isEmpty ? (
        <div className="mt-8">
          <GettingStarted hasPlayers={players.length > 0} hasTeams={teams.length >= 2} />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {/* Live + recent matches */}
          <div className="lg:col-span-2">
            {liveMatches.length > 0 && (
              <section className="mb-6">
                <h2 className="text-muted-foreground mb-3 text-sm font-semibold uppercase tracking-wide">
                  Live now
                </h2>
                <div className="space-y-3">
                  {liveMatches.map((m) => (
                    <Card
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={m.status} />
                          <p className="truncate font-semibold">
                            {m.title ??
                              `${teamName.get(m.teamAId) ?? 'Team A'} vs ${teamName.get(m.teamBId) ?? 'Team B'}`}
                          </p>
                        </div>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {m.oversPerInnings} overs
                          {m.venue ? ` · ${m.venue}` : ''}
                        </p>
                      </div>
                      <ButtonLink href={`/matches/${m.id}/score`} size="sm">
                        Resume scoring <ArrowRight className="h-3.5 w-3.5" />
                      </ButtonLink>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wide">
                  Recent matches
                </h2>
                <Link href="/matches" className="text-primary text-sm font-medium hover:underline">
                  View all
                </Link>
              </div>
              {recentMatches.length === 0 ? (
                <EmptyState
                  icon={<Swords className="h-8 w-8" />}
                  title="No matches yet"
                  hint="Start your first match and it will show up here."
                  action={
                    <ButtonLink href="/matches/new" size="sm">
                      <Plus className="h-4 w-4" /> New match
                    </ButtonLink>
                  }
                />
              ) : (
                <Card className="divide-border divide-y">
                  {recentMatches.map((m) => (
                    <Link
                      key={m.id}
                      href={`/matches/${m.id}/score`}
                      className="hover:bg-accent/40 flex items-center justify-between gap-3 px-4 py-3 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {m.title ??
                            `${teamName.get(m.teamAId) ?? 'Team A'} vs ${teamName.get(m.teamBId) ?? 'Team B'}`}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {m.oversPerInnings} overs{m.venue ? ` · ${m.venue}` : ''}
                        </p>
                      </div>
                      <StatusBadge status={m.status} />
                    </Link>
                  ))}
                </Card>
              )}
            </section>
          </div>

          {/* Quick actions */}
          <aside>
            <h2 className="text-muted-foreground mb-3 text-sm font-semibold uppercase tracking-wide">
              Quick actions
            </h2>
            <Card className="divide-border divide-y">
              <QuickAction
                href="/matches/new"
                icon={<Swords className="h-4 w-4" />}
                title="Start a match"
                hint="Pick teams, set overs, score"
              />
              <QuickAction
                href="/players/new"
                icon={<Users className="h-4 w-4" />}
                title="Add a player"
                hint="Build your player database"
              />
              <QuickAction
                href="/teams/new"
                icon={<Shield className="h-4 w-4" />}
                title="Create a team"
                hint="Assemble a squad"
              />
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}

function QuickAction({
  href,
  icon,
  title,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="hover:bg-accent/40 flex items-center gap-3 px-4 py-3.5 transition-colors"
    >
      <span className="bg-accent text-accent-foreground inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="text-muted-foreground block text-xs">{hint}</span>
      </span>
      <ArrowRight className="text-muted-foreground ml-auto h-4 w-4" />
    </Link>
  );
}

/** Three-step onboarding shown when the account has no data yet. */
function GettingStarted({ hasPlayers, hasTeams }: { hasPlayers: boolean; hasTeams: boolean }) {
  const steps = [
    {
      done: hasPlayers,
      title: 'Add your players',
      hint: 'Names are enough to start — styles and roles are optional.',
      href: '/players/new',
      cta: 'Add players',
    },
    {
      done: hasTeams,
      title: 'Create two teams',
      hint: 'A match needs two sides. Pick squads from your players.',
      href: '/teams/new',
      cta: 'Create teams',
    },
    {
      done: false,
      title: 'Start scoring',
      hint: 'Set overs, choose openers, and score ball by ball.',
      href: '/matches/new',
      cta: 'New match',
    },
  ];
  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold">Welcome to Open Innings 🏏</h2>
      <p className="text-muted-foreground mt-1 text-sm">Three steps to your first scored match:</p>
      <ol className="mt-5 space-y-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-start gap-4">
            <span
              className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                s.done
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground'
              }`}
            >
              {s.done ? '✓' : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.title}</p>
              <p className="text-muted-foreground text-sm">{s.hint}</p>
            </div>
            <ButtonLink href={s.href} variant={i === 0 ? 'primary' : 'outline'} size="sm">
              {s.cta}
            </ButtonLink>
          </li>
        ))}
      </ol>
    </Card>
  );
}
