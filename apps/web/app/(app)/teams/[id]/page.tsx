import { notFound, redirect } from 'next/navigation';
import { UserPlus, X } from 'lucide-react';
import { getTeam, getTeamMembers, listPlayers } from '@/lib/db/queries';
import { getUserId } from '@/lib/auth/local';
import { updateTeamAction, addTeamMemberAction, removeTeamMemberAction } from './actions';
import {
  Button,
  FormError,
  FormSection,
  Input,
  Label,
  Monogram,
  PageHeader,
  Select,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function TeamDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { error } = await searchParams;

  const userId = await getUserId();
  if (!userId) redirect('/login');

  const team = await getTeam(id);
  if (!team || team.ownerId !== userId) notFound();

  const [squad, allPlayers] = await Promise.all([
    getTeamMembers(id),
    listPlayers().catch(() => []),
  ]);
  const squadIds = new Set(squad.map((p) => p.id));
  const availablePlayers = allPlayers.filter((p) => !squadIds.has(p.id));

  return (
    <div className="container max-w-2xl py-8">
      <PageHeader title={team.name} description="Rename the team and manage its squad." />
      <FormError message={error} />

      <div className="space-y-5">
        <FormSection title="Team details">
          <form action={updateTeamAction.bind(null, id)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <div>
                <Label htmlFor="name">Team name</Label>
                <Input id="name" name="name" required defaultValue={team.name} />
              </div>
              <div>
                <Label htmlFor="shortName">Short name</Label>
                <Input id="shortName" name="shortName" defaultValue={team.shortName ?? ''} />
              </div>
            </div>
            <div>
              <Label htmlFor="homeGround">Home ground</Label>
              <Input id="homeGround" name="homeGround" defaultValue={team.homeGround ?? ''} />
            </div>
            <Button type="submit" size="sm">
              Save changes
            </Button>
          </form>
        </FormSection>

        <FormSection title={`Squad (${squad.length})`}>
          {squad.length === 0 ? (
            <p className="text-muted-foreground text-sm">No players on this squad yet.</p>
          ) : (
            <ul className="divide-border divide-y">
              {squad.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <Monogram name={p.fullName} className="h-8 w-8 text-xs" />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.fullName}</span>
                  <form action={removeTeamMemberAction.bind(null, id, p.id)}>
                    <button
                      type="submit"
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                      title={`Remove ${p.fullName}`}
                      aria-label={`Remove ${p.fullName} from squad`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          {availablePlayers.length > 0 && (
            <form
              action={addTeamMemberAction.bind(null, id)}
              className="border-border flex items-end gap-2 border-t pt-4"
            >
              <div className="flex-1">
                <Label htmlFor="playerId">Add player</Label>
                <Select id="playerId" name="playerId" required defaultValue="">
                  <option value="" disabled>
                    Choose a player
                  </option>
                  {availablePlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" variant="outline" size="md">
                <UserPlus className="h-4 w-4" /> Add
              </Button>
            </form>
          )}

          {availablePlayers.length === 0 && allPlayers.length === 0 && (
            <p className="border-border text-muted-foreground border-t pt-4 text-sm">
              You don&apos;t have any players yet — add some from the Players page first.
            </p>
          )}
        </FormSection>
      </div>
    </div>
  );
}
