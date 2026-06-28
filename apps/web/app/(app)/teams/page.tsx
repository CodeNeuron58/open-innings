import Link from 'next/link';
import { listTeams, getTeamMembers } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function TeamsPage() {
  let teams: Awaited<ReturnType<typeof listTeams>> = [];
  let dbError: string | null = null;
  try {
    teams = await listTeams();
  } catch (err) {
    dbError = err instanceof Error ? err.message : 'Database error';
  }

  // Build member counts
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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Teams</h1>
        <Link
          href="/teams/new"
          className="rounded-md bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"
        >
          + Add team
        </Link>
      </div>

      {dbError ? (
        <div className="rounded-md border border-yellow-500 bg-yellow-50 p-4 text-sm text-yellow-900">
          <strong>Database not configured.</strong> ({dbError})
        </div>
      ) : teams.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground">No teams yet.</p>
          <Link href="/teams/new" className="mt-3 inline-block text-green-600 hover:underline">
            Create your first team
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <li
              key={t.id}
              className="rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <p className="font-bold">{t.name}</p>
              {t.shortName && (
                <p className="text-xs text-muted-foreground">{t.shortName}</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {memberCounts[t.id] ?? 0} member
                {(memberCounts[t.id] ?? 0) === 1 ? '' : 's'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}