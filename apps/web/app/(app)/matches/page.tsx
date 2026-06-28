import Link from 'next/link';
import { listMatches } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function MatchesPage() {
  let matches: Awaited<ReturnType<typeof listMatches>> = [];
  let dbError: string | null = null;
  try {
    matches = await listMatches();
  } catch (err) {
    dbError = err instanceof Error ? err.message : 'Database error';
  }

  return (
    <div className="container py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Matches</h1>
        <Link
          href="/matches/new"
          className="rounded-md bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"
        >
          + New match
        </Link>
      </div>

      {dbError ? (
        <div className="rounded-md border border-yellow-500 bg-yellow-50 p-4 text-sm text-yellow-900">
          <strong>Database not configured.</strong> ({dbError})
        </div>
      ) : matches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground">No matches yet.</p>
          <Link href="/matches/new" className="mt-3 inline-block text-green-600 hover:underline">
            Start a new match
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {matches.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium">{m.title ?? `Match ${m.id.slice(0, 8)}`}</p>
                <p className="text-xs text-muted-foreground">
                  {m.oversPerInnings} overs · {m.status}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/matches/${m.id}/score`}
                  className="text-sm text-green-600 hover:underline"
                >
                  Score
                </Link>
                <Link
                  href={`/m/${m.id}`}
                  className="text-sm text-muted-foreground hover:underline"
                >
                  Public
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}