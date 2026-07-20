'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createTeam, addPlayerToTeam } from '@/lib/db/queries';

/** User-facing failures redirect back to the form — never the error page. */
function fail(message: string): never {
  redirect(`/teams/new?error=${encodeURIComponent(message)}`);
}

export async function createTeamAction(formData: FormData): Promise<void> {
  const name = (formData.get('name') as string)?.trim();
  if (!name) fail('Team name is required');

  const shortName = (formData.get('shortName') as string)?.trim() || undefined;
  const homeGround = (formData.get('homeGround') as string)?.trim() || undefined;

  const team = await createTeam({ name, shortName, homeGround });
  if (!team) fail('Could not create team — make sure you are signed in');

  const playerIds = formData.getAll('playerIds') as string[];
  for (const playerId of playerIds) {
    if (playerId) await addPlayerToTeam(team.id, playerId);
  }

  revalidatePath('/teams');
  redirect('/teams');
}