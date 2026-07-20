import { Shield, Coins, Users } from 'lucide-react';
import { listTeams, getTeamMembers } from '@/lib/db/queries';
import { createMatchAction } from './actions';
import {
  Button,
  ButtonLink,
  Card,
  FormError,
  Input,
  Label,
  PageHeader,
  Select,
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
  const teamAMembers = teams[0] ? await getTeamMembers(teams[0].id).catch(() => []) : [];
  const teamBMembers = teams[1] ? await getTeamMembers(teams[1].id).catch(() => []) : [];

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

  const allMembers = [...teamAMembers, ...teamBMembers];

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

        {/* Teams */}
        <FormSection title="Teams" icon={<Shield className="h-4 w-4" />}>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div>
              <Label htmlFor="teamAId">Team A</Label>
              <Select id="teamAId" name="teamAId" required defaultValue={teams[0]?.id}>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
            <span className="pb-2.5 text-xs font-bold uppercase text-muted-foreground">vs</span>
            <div>
              <Label htmlFor="teamBId">Team B</Label>
              <Select
                id="teamBId"
                name="teamBId"
                required
                defaultValue={teams[1]?.id ?? teams[0]?.id}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </FormSection>

        {/* Toss */}
        <FormSection title="Toss" icon={<Coins className="h-4 w-4" />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="tossWinnerTeamId">Toss winner</Label>
              <Select id="tossWinnerTeamId" name="tossWinnerTeamId">
                <option value="">—</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="tossDecision">Decision</Label>
              <Select id="tossDecision" name="tossDecision">
                <option value="">—</option>
                <option value="bat">Bat</option>
                <option value="bowl">Bowl</option>
              </Select>
            </div>
          </div>
        </FormSection>

        {/* Openers */}
        <FormSection title="Opening players" icon={<Users className="h-4 w-4" />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="openingStrikerId">Striker</Label>
              <Select id="openingStrikerId" name="openingStrikerId" required>
                <option value="">—</option>
                {allMembers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="openingNonStrikerId">Non-striker</Label>
              <Select id="openingNonStrikerId" name="openingNonStrikerId" required>
                <option value="">—</option>
                {allMembers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="openingBowlerId">Opening bowler</Label>
            <Select id="openingBowlerId" name="openingBowlerId" required>
              <option value="">—</option>
              {allMembers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </Select>
          </div>
        </FormSection>

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

function FormSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}
