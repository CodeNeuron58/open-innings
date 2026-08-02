/**
 * Players and teams, transport-free.
 */
import 'server-only';
import type { CreatePlayerInput, CreateTeamInput, UpdateTeamInput } from '@open-innings/shared';
import {
  createPlayer,
  createTeam,
  getTeam,
  updateTeam,
  addPlayerToTeam,
  removeTeamMember,
} from '@/lib/db/queries';
import { getUserId } from '@/lib/auth/local';
import { notFound, unauthorized } from './errors';

export async function createPlayerFor(input: CreatePlayerInput) {
  const player = await createPlayer(input);
  // The query layer returns null rather than throwing when there's no session.
  if (!player) throw unauthorized('Sign in to add a player');
  return player;
}

/** Create a team and seed its squad in one step. */
export async function createTeamFor(input: CreateTeamInput, playerIds: string[] = []) {
  const team = await createTeam(input);
  if (!team) throw unauthorized('Sign in to create a team');

  for (const playerId of playerIds) {
    if (playerId) await addPlayerToTeam(team.id, playerId);
  }

  return team;
}

/** Load a team the current user owns, or throw. */
async function requireOwnedTeam(teamId: string) {
  const userId = await getUserId();
  if (!userId) throw unauthorized();

  const team = await getTeam(teamId);
  if (!team || team.ownerId !== userId) throw notFound('Team not found');

  return { team, userId };
}

export async function updateOwnedTeam(teamId: string, input: UpdateTeamInput) {
  const { userId } = await requireOwnedTeam(teamId);
  await updateTeam(teamId, userId, input);
}

export async function addMemberToOwnedTeam(teamId: string, playerId: string) {
  await requireOwnedTeam(teamId);
  await addPlayerToTeam(teamId, playerId);
}

export async function removeMemberFromOwnedTeam(teamId: string, playerId: string) {
  await requireOwnedTeam(teamId);
  await removeTeamMember(teamId, playerId);
}
