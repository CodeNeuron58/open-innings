import Link from 'next/link';
import { Plus, Swords, Share2, Play } from 'lucide-react';
import { listMatches, listTeams } from '@/lib/db/queries';
import {
  ButtonLink,
  Card,
  PageHeader,
  StatusBadge,
  EmptyState,
  buttonVariants,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function MatchesPage() {
  let matches: Awaited<ReturnType<typeof listMatches>> = [];
  let dbError: string | null = null;
  try {
    matches = await listMatches();
  } catch (err) {
    dbError = err instanceof Error ? err.message : 'Database error';
  }
  const teams = await listTeams().catch(() => []);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));

  return (
    <div className="container py-8">
      <PageHeader
        title="Matches"
        description="Everything you've scored, live and finished."
        action={
          <ButtonLink href="/matches/new">
            <Plus className="h-4 w-4" /> New match
          </ButtonLink>
        }
      />

      {dbError ? (
        <Card className="border-extra/40 bg-extra/10 p-4 text-sm">
          <strong>Database not configured.</strong> ({dbError})
        </Card>
      ) : matches.length === 0 ? (
        <EmptyState
          icon={<Swords className="h-8 w-8" />}
          title="No matches yet"
          hint="Create two teams, then start your first match — scoring takes seconds to set up."
          action={
            <ButtonLink href="/matches/new" size="sm">
              <Plus className="h-4 w-4" /> Start a new match
            </ButtonLink>
          }
        />
      ) : (
        <div className="space-y-3">
          {matches.map((m) => {
            const title =
              m.title ??
              `${teamName.get(m.teamAId) ?? 'Team A'} vs ${teamName.get(m.teamBId) ?? 'Team B'}`;
            return (
              <Card
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4 transition-shadow hover:shadow-card-hover"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={m.status} />
                    <p className="truncate font-semibold">{title}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {teamName.get(m.teamAId) ?? 'Team A'} vs {teamName.get(m.teamBId) ?? 'Team B'}{' '}
                    · {m.oversPerInnings} overs
                    {m.venue ? ` · ${m.venue}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/m/${m.id}`}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    <Share2 className="h-3.5 w-3.5" /> Share
                  </Link>
                  <ButtonLink href={`/matches/${m.id}/score`} size="sm">
                    <Play className="h-3.5 w-3.5" />
                    {m.status === 'completed' ? 'Open' : 'Score'}
                  </ButtonLink>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
