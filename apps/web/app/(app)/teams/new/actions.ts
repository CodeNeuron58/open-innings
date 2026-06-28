'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createTeam, addPlayerToTeam } from '@/lib/db/queries';

export async function createTeamAction(formData: FormData): Promise<void> {
  const name = (formData.get('name') as string)?.trim();
  if (!name) throw new Error('Team name is required');

  const shortName = (formData.get('shortName') as string)?.trim() || undefined;
  const homeGround = (formData.get('homeGround') as string)?.trim() || undefined;

  const team = await createTeam({ name, shortName, homeGround });
  if (!team) throw new Error('Could not create team. Make sure you are signed in.');

  const playerIds = formData.getAll('playerIds') as string[];
  for (const playerId of playerIds) {
    if (playerId) await addPlayerToTeam(team.id, playerId);
  }

  revalidatePath('/teams');
  redirect('/teams');
}