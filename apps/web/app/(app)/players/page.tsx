import Link from 'next/link';
import { listPlayers } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function PlayersPage() {
  let players: Awaited<ReturnType<typeof listPlayers>> = [];
  let dbError: string | null = null;
  try {
    players = await listPlayers();
  } catch (err) {
    dbError = err instanceof Error ? err.message : 'Database error';
  }

  return (
    <div className="container py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Players</h1>
        <Link
          href="/players/new"
          className="rounded-md bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"
        >
          + Add player
        </Link>
      </div>

      {dbError ? (
        <div className="rounded-md border border-yellow-500 bg-yellow-50 p-4 text-sm text-yellow-900">
          <strong>Database not configured.</strong> Set <code>DATABASE_URL</code> in{' '}
          <code>.env.local</code> and run the migrations. ({dbError})
        </div>
      ) : players.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground">No players yet.</p>
          <Link
            href="/players/new"
            className="mt-3 inline-block text-green-600 hover:underline"
          >
            Add your first player
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {players.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium">{p.fullName}</p>
                {p.shortName && (
                  <p className="text-xs text-muted-foreground">aka {p.shortName}</p>
                )}
              </div>
              <span className="text-xs uppercase text-muted-foreground">
                {p.role ?? p.battingStyle ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}