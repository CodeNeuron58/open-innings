import { Shield } from 'lucide-react';
import { listTeams, getTeamMembers } from '@/lib/db/queries';
import { createMatchAction } from './actions';
import { NewMatchOpenerFields } from '@/components/matches/NewMatchOpenerFields';
import {
  Button,
  ButtonLink,
  FormError,
  FormSection,
  Input,
  Label,
  PageHeader,
  EmptyState,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const teams = await listTeams().catch(() => []);

  if (teams.length < 2) {
    return (
      <div className="container max-w-xl py-8">
        <PageHeader title="New match" />
        <EmptyState
          icon={<Shield className="h-8 w-8" />}
          title="You need at least 2 teams to start a match"
          hint="Create both sides first — you can pick squads from your player database."
          action={
            <ButtonLink href="/teams/new" size="sm">
              Create teams first
            </ButtonLink>
          }
        />
      </div>
    );
  }

  // Full squads for every team, up front — the opener fields below filter by
  // whichever team ends up batting/bowling once toss + team pickers settle,
  // which can change client-side after this page has rendered.
  const squadsByTeam: Record<string, { id: string; fullName: string }[]> = {};
  await Promise.all(
    teams.map(async (t) => {
      squadsByTeam[t.id] = (await getTeamMembers(t.id).catch(() => [])).map((p) => ({
        id: p.id,
        fullName: p.fullName,
      }));
    }),
  );

  return (
    <div className="container max-w-2xl py-8">
      <PageHeader
        title="New match"
        description="Set the format, pick the sides, name the openers — then score."
      />
      <FormError message={error} />
      <form action={createMatchAction} className="space-y-5">
        {/* Match details */}
        <FormSection title="Match details">
          <div>
            <Label htmlFor="title">Title (optional)</Label>
            <Input id="title" name="title" placeholder="e.g. Sunday League Final" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="venue">Venue (optional)</Label>
              <Input id="venue" name="venue" placeholder="e.g. Oval Maidan" />
            </div>
            <div>
              <Label htmlFor="oversPerInnings">Overs per innings</Label>
              <Input
                id="oversPerInnings"
                type="number"
                name="oversPerInnings"
                defaultValue={5}
                min={1}
                max={50}
                required
              />
            </div>
          </div>
        </FormSection>

        <NewMatchOpenerFields
          teams={teams.map((t) => ({ id: t.id, name: t.name }))}
          squadsByTeam={squadsByTeam}
        />

        <div className="flex gap-3 pt-1">
          <Button type="submit" size="lg">
            Start match
          </Button>
          <ButtonLink href="/matches" variant="outline" size="lg">
            Cancel
          </ButtonLink>
        </div>
      </form>
    </div>
  );
}
