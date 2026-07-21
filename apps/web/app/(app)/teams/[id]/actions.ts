'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getTeam, updateTeam, addPlayerToTeam, removeTeamMember } from '@/lib/db/queries';
import { getUserId } from '@/lib/auth/local';

/** User-facing failures redirect back to the team detail page. */
function fail(teamId: string, message: string): never {
  redirect(`/teams/${teamId}?error=${encodeURIComponent(message)}`);
}

async function requireOwnedTeam(teamId: string) {
  const userId = await getUserId();
  if (!userId) redirect('/login');
  const team = await getTeam(teamId);
  if (!team || team.ownerId !== userId) redirect('/teams');
  return { team, userId };
}

export async function updateTeamAction(teamId: string, formData: FormData): Promise<void> {
  const { userId } = await requireOwnedTeam(teamId);

  const name = (formData.get('name') as string)?.trim();
  if (!name) fail(teamId, 'Team name is required');
  const shortName = (formData.get('shortName') as string)?.trim() || undefined;
  const homeGround = (formData.get('homeGround') as string)?.trim() || undefined;

  await updateTeam(teamId, userId, { name, shortName, homeGround });
  revalidatePath(`/teams/${teamId}`);
  revalidatePath('/teams');
  redirect(`/teams/${teamId}`);
}

export async function addTeamMemberAction(teamId: string, formData: FormData): Promise<void> {
  await requireOwnedTeam(teamId);

  const playerId = formData.get('playerId') as string;
  if (!playerId) fail(teamId, 'Pick a player to add');

  await addPlayerToTeam(teamId, playerId);
  revalidatePath(`/teams/${teamId}`);
  redirect(`/teams/${teamId}`);
}

export async function removeTeamMemberAction(teamId: string, playerId: string): Promise<void> {
  await requireOwnedTeam(teamId);

  await removeTeamMember(teamId, playerId);
  revalidatePath(`/teams/${teamId}`);
  redirect(`/teams/${teamId}`);
}
