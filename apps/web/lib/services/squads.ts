/**
 * Players and teams, transport-free.
 */
import 'server-only';
import type { CreatePlayerInput, CreateTeamInput, UpdateTeamInput } from '@open-innings/shared';
import {
  createPlayer,
  createTeam,
  getPlayer,
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

  // Same check as addMemberToOwnedTeam — seeding a squad at create time is
  // not a way around it.
  for (const playerId of playerIds) {
    if (!playerId) continue;
    await requireOwnedPlayer(playerId, team.ownerId);
    await addPlayerToTeam(team.id, playerId);
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

/**
 * A player the current user created, or throw.
 *
 * Team ownership was the only check on squad changes, so any signed-in user
 * could add *any* player id to a team they owned — and then read that
 * player's name and role straight back out of `/api/teams/[id]/club`, which
 * is public. Guessing a uuid is the only thing that made it hard, and "hard
 * to guess" is not an access control.
 *
 * Created-by is the right test because it is the same one `listPlayers` uses:
 * a player is only visible to whoever added them, so a player you cannot see
 * is a player you cannot pick.
 *
 * Reported as not-found rather than forbidden, like every other ownership
 * failure here — see errors.ts.
 */
async function requireOwnedPlayer(playerId: string, userId: string) {
  const player = await getPlayer(playerId);
  if (!player || player.createdBy !== userId) throw notFound('Player not found');
  return player;
}

export async function addMemberToOwnedTeam(teamId: string, playerId: string) {
  const { userId } = await requireOwnedTeam(teamId);
  await requireOwnedPlayer(playerId, userId);
  await addPlayerToTeam(teamId, playerId);
}

export async function removeMemberFromOwnedTeam(teamId: string, playerId: string) {
  await requireOwnedTeam(teamId);
  await removeTeamMember(teamId, playerId);
}
