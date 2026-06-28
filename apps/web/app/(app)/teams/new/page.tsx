import Link from 'next/link';
import { listPlayers } from '@/lib/db/queries';
import { createTeamAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function NewTeamPage() {
  const players = await listPlayers().catch(() => []);

  return (
    <div className="container max-w-xl py-8">
      <h1 className="mb-6 text-3xl font-bold">Add team</h1>
      <form action={createTeamAction} className="space-y-4">
        <Field label="Team name" name="name" required />
        <Field label="Short name (e.g. IND)" name="shortName" />
        <Field label="Home ground" name="homeGround" />

        <div>
          <label className="mb-2 block text-sm font-medium">Squad (optional)</label>
          {players.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No players yet.{' '}
              <Link href="/players/new" className="text-green-600 hover:underline">
                Add players first
              </Link>
              .
            </p>
          ) : (
            <div className="max-h-60 overflow-y-auto rounded-md border border-border bg-card p-3 space-y-1">
              {players.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="playerIds" value={p.id} />
                  <span>{p.fullName}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            className="rounded-md bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"
          >
            Save
          </button>
          <Link
            href="/teams"
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({ label, name, required = false }: { label: string; name: string; required?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <input
        name={name}
        required={required}
        className="w-full rounded-md border border-border bg-card px-3 py-2"
      />
    </div>
  );
}