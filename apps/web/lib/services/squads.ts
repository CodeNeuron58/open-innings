/**
 * Players and teams, transport-free.
 */
import 'server-only';
import type {
  CreatePlayerInput,
  CreateTeamInput,
  UpdatePlayerInput,
  UpdateTeamInput,
  UpdateTeamMemberInput,
} from '@open-innings/shared';
import {
  createPlayer,
  createTeam,
  getPlayer,
  getTeam,
  updateTeam,
  updatePlayer,
  deletePlayer,
  deleteTeam,
  playerAppearances,
  teamMatchCount,
  addPlayerToTeam,
  removeTeamMember,
  updateTeamMemberRole,
  getTeamMembers,
} from '@/lib/db/queries';
import { getUserId } from '@/lib/auth/local';
import { conflict, notFound, unauthorized } from './errors';

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
    await requirePlayerExists(playerId);
    await addPlayerToTeam(team.id, playerId);
  }

  return team;
}

/** Load a team the current user owns, or throw. */
/**
 * A player the current user created, or throw.
 *
 * Not the same test as `requirePlayerExists` below, and the difference is the
 * point: anyone may put anybody in their own squad, because a cricketer who
 * plays for two clubs is one person. Writing to the player row is a different
 * act, and it stays with whoever made it.
 *
 * Reported as not-found rather than forbidden, like every other ownership
 * failure here — see errors.ts.
 */
async function requireOwnedPlayer(playerId: string) {
  const userId = await getUserId();
  if (!userId) throw unauthorized();

  const player = await getPlayer(playerId);
  if (!player || player.createdBy !== userId) throw notFound('Player not found');

  return { player, userId };
}

export async function updateOwnedPlayer(playerId: string, input: UpdatePlayerInput) {
  const { userId } = await requireOwnedPlayer(playerId);
  await updatePlayer(playerId, userId, input);
}

/**
 * Delete a player who has never played.
 *
 * The database refuses to remove anybody who appears in a ball log, and it is
 * right to: their runs are in matches other people scored, and a scorecard
 * with a hole in it is worse than a duplicate name in a list.
 *
 * So the count comes first, and the refusal names the alternative. **Merge is
 * the answer for a duplicate who has played** — it moves the deliveries across
 * and dissolves the extra row, which is what somebody deleting a duplicate
 * actually wants and cannot get from a delete.
 */
export async function deleteOwnedPlayer(playerId: string) {
  const { player, userId } = await requireOwnedPlayer(playerId);

  const { deliveries, squads } = await playerAppearances(playerId);
  if (deliveries > 0 || squads > 0) {
    const where =
      deliveries > 0
        ? `${deliveries} ${deliveries === 1 ? 'delivery' : 'deliveries'}`
        : `${squads} ${squads === 1 ? 'squad' : 'squads'}`;
    throw conflict(
      `${player.fullName} appears in ${where} and cannot be deleted. If this is a duplicate, merge them into the right player instead — their record moves across.`,
    );
  }

  await deletePlayer(playerId, userId);
}

/**
 * Delete a club that has never played a fixture.
 *
 * Same rule as a player, for the same reason: a match names two sides, and a
 * side that stops existing takes the fixture's meaning with it. Squad
 * memberships cascade, so an unplayed club with a full roster deletes cleanly.
 */
export async function deleteOwnedTeam(teamId: string) {
  const { team, userId } = await requireOwnedTeam(teamId);

  const played = await teamMatchCount(teamId);
  if (played > 0) {
    throw conflict(
      `${team.name} is named in ${played} ${played === 1 ? 'match' : 'matches'} and cannot be deleted. Deleting it would leave those fixtures without a side.`,
    );
  }

  await deleteTeam(teamId, userId);
}

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
/**
 * A player has to exist to join a squad. It does **not** have to be yours.
 *
 * This used to require `createdBy === userId`, and that single condition was
 * the other half of why a career could not follow a person between clubs. A
 * cricketer who plays for two clubs is one person; if the second club cannot
 * add the row the first club created, they create a second one, and the
 * career splits permanently.
 *
 * The trade is deliberate and worth stating plainly: anyone can now put
 * anybody in their squad and score them, which contributes to that player's
 * public career. That is the same trust model every club scoring app runs on
 * — the record is only as good as the people keeping it — and it is the model
 * the product's central claim requires. Claiming a player (`players.user_id`,
 * via `PUT /api/me/player`) is what gives a real person visibility of what is
 * being attributed to them.
 *
 * Squad *membership* is still owner-only, and so is everything that writes to
 * the player row. Adding somebody to your side is not editing them.
 */
async function requirePlayerExists(playerId: string) {
  const player = await getPlayer(playerId);
  if (!player) throw notFound('Player not found');
  return player;
}

export async function addMemberToOwnedTeam(teamId: string, playerId: string) {
  const { team } = await requireOwnedTeam(teamId);
  await requirePlayerExists(playerId);
  await addPlayerToTeam(team.id, playerId);
}

/**
 * Set captaincy, keeping, or a jersey number on a squad membership.
 *
 * These three columns have existed since the first migration and nothing has
 * ever written them, so every squad in the system has had no captain and no
 * keeper. The keeper is not decoration: they are who takes byes and stumpings,
 * and the obvious default fielder on a caught-behind.
 *
 * The player has to be in the squad already. Adding somebody by giving them
 * the gloves would skip `requireOwnedPlayer` and reopen the hole that closed.
 */
export async function updateOwnedTeamMember(teamId: string, input: UpdateTeamMemberInput) {
  await requireOwnedTeam(teamId);

  const members = await getTeamMembers(teamId);
  if (!members.some((m) => m.id === input.playerId)) {
    throw notFound('That player is not in this squad');
  }

  const { playerId, ...patch } = input;
  await updateTeamMemberRole(teamId, playerId, patch);
}

export async function removeMemberFromOwnedTeam(teamId: string, playerId: string) {
  await requireOwnedTeam(teamId);
  await removeTeamMember(teamId, playerId);
}
