import Link from 'next/link';
import { createPlayerAction } from './actions';

export default function NewPlayerPage() {
  return (
    <div className="container max-w-xl py-8">
      <h1 className="mb-6 text-3xl font-bold">Add player</h1>
      <form action={createPlayerAction} className="space-y-4">
        <Field label="Full name" name="fullName" required />
        <Field label="Short name (e.g. VK)" name="shortName" />

        <div>
          <label className="mb-1 block text-sm font-medium">Batting style</label>
          <select
            name="battingStyle"
            className="w-full rounded-md border border-border bg-card px-3 py-2"
          >
            <option value="">—</option>
            <option value="right_hand">Right hand</option>
            <option value="left_hand">Left hand</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Bowling style</label>
          <select
            name="bowlingStyle"
            className="w-full rounded-md border border-border bg-card px-3 py-2"
          >
            <option value="">—</option>
            <option value="right_arm_fast">Right arm fast</option>
            <option value="left_arm_fast">Left arm fast</option>
            <option value="right_arm_medium">Right arm medium</option>
            <option value="left_arm_medium">Left arm medium</option>
            <option value="right_arm_spin">Right arm spin</option>
            <option value="left_arm_spin">Left arm spin</option>
            <option value="right_arm_off_break">Right arm off break</option>
            <option value="left_arm_orthodox">Left arm orthodox</option>
            <option value="leg_break">Leg break</option>
            <option value="googly">Googly</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Role</label>
          <select
            name="role"
            className="w-full rounded-md border border-border bg-card px-3 py-2"
          >
            <option value="">—</option>
            <option value="batsman">Batsman</option>
            <option value="bowler">Bowler</option>
            <option value="all_rounder">All-rounder</option>
            <option value="wicket_keeper">Wicket-keeper</option>
            <option value="wicket_keeper_batsman">WK-batsman</option>
          </select>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            className="rounded-md bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"
          >
            Save
          </button>
          <Link
            href="/players"
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