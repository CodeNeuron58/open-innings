import Link from 'next/link';
import { listTeams, getTeamMembers } from '@/lib/db/queries';
import { createMatchAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function NewMatchPage() {
  const teams = await listTeams().catch(() => []);
  const teamAMembers = teams[0] ? await getTeamMembers(teams[0].id).catch(() => []) : [];
  const teamBMembers = teams[1] ? await getTeamMembers(teams[1].id).catch(() => []) : [];

  if (teams.length < 2) {
    return (
      <div className="container max-w-xl py-8">
        <h1 className="mb-6 text-3xl font-bold">New match</h1>
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground">You need at least 2 teams to start a match.</p>
          <Link href="/teams/new" className="mt-3 inline-block text-green-600 hover:underline">
            Create teams first
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8">
      <h1 className="mb-6 text-3xl font-bold">New match</h1>
      <form action={createMatchAction} className="space-y-5">
        <Field label="Title (optional)" name="title" placeholder="e.g. Sunday League Final" />
        <Field label="Venue (optional)" name="venue" />
        <div>
          <label className="mb-1 block text-sm font-medium">Overs per innings</label>
          <input
            type="number"
            name="oversPerInnings"
            defaultValue={5}
            min={1}
            max={50}
            required
            className="w-full rounded-md border border-border bg-card px-3 py-2"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Team A</label>
            <select
              name="teamAId"
              required
              className="w-full rounded-md border border-border bg-card px-3 py-2"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Team B</label>
            <select
              name="teamBId"
              required
              className="w-full rounded-md border border-border bg-card px-3 py-2"
            >
              {teams.map((t, i) => (
                <option key={t.id} value={t.id} defaultChecked={i === 1}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Toss winner</label>
            <select
              name="tossWinnerTeamId"
              className="w-full rounded-md border border-border bg-card px-3 py-2"
            >
              <option value="">—</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Decision</label>
            <select
              name="tossDecision"
              className="w-full rounded-md border border-border bg-card px-3 py-2"
            >
              <option value="">—</option>
              <option value="bat">Bat</option>
              <option value="bowl">Bowl</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Opening striker</label>
          <select
            name="openingStrikerId"
            required
            className="w-full rounded-md border border-border bg-card px-3 py-2"
          >
            <option value="">—</option>
            {[...teamAMembers, ...teamBMembers].map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Opening non-striker</label>
          <select
            name="openingNonStrikerId"
            required
            className="w-full rounded-md border border-border bg-card px-3 py-2"
          >
            <option value="">—</option>
            {[...teamAMembers, ...teamBMembers].map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Opening bowler</label>
          <select
            name="openingBowlerId"
            required
            className="w-full rounded-md border border-border bg-card px-3 py-2"
          >
            <option value="">—</option>
            {[...teamAMembers, ...teamBMembers].map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            className="rounded-md bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"
          >
            Start match
          </button>
          <Link
            href="/matches"
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  placeholder,
}: {
  label: string;
  name: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <input
        name={name}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-card px-3 py-2"
      />
    </div>
  );
}