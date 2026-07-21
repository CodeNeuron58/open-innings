import Link from 'next/link';
import { Plus, Shield, MapPin, Users } from 'lucide-react';
import { listTeams, getTeamMembers } from '@/lib/db/queries';
import {
  ButtonLink,
  Card,
  PageHeader,
  EmptyState,
  Monogram,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function TeamsPage() {
  let teams: Awaited<ReturnType<typeof listTeams>> = [];
  let dbError: string | null = null;
  try {
    teams = await listTeams();
  } catch (err) {
    dbError = err instanceof Error ? err.message : 'Database error';
  }

  const memberCounts: Record<string, number> = {};
  for (const t of teams) {
    try {
      const members = await getTeamMembers(t.id);
      memberCounts[t.id] = members.length;
    } catch {
      memberCounts[t.id] = 0;
    }
  }

  return (
    <div className="container py-8">
      <PageHeader
        title="Teams"
        description="Squads you can pick a match XI from."
        action={
          <ButtonLink href="/teams/new">
            <Plus className="h-4 w-4" /> Add team
          </ButtonLink>
        }
      />

      {dbError ? (
        <Card className="border-extra/40 bg-extra/10 p-4 text-sm">
          <strong>Database not configured.</strong> ({dbError})
        </Card>
      ) : teams.length === 0 ? (
        <EmptyState
          icon={<Shield className="h-8 w-8" />}
          title="No teams yet"
          hint="You need two teams for a match. Create the first one now."
          action={
            <ButtonLink href="/teams/new" size="sm">
              <Plus className="h-4 w-4" /> Create your first team
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => {
            const count = memberCounts[t.id] ?? 0;
            return (
              <Link key={t.id} href={`/teams/${t.id}`} className="block">
                <Card className="p-5 transition-shadow hover:shadow-card-hover">
                  <div className="flex items-center gap-3">
                    <Monogram
                      name={t.shortName ?? t.name}
                      className="h-12 w-12 bg-primary text-base text-primary-foreground"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-bold">{t.name}</p>
                      {t.shortName && (
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          {t.shortName}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {count} member{count === 1 ? '' : 's'}
                    </span>
                    {t.homeGround && (
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{t.homeGround}</span>
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
