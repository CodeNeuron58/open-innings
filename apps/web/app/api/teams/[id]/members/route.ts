/**
 * POST   /api/teams/[id]/members — add a player to the squad.
 * DELETE /api/teams/[id]/members — remove one.
 *
 * DELETE takes the player in the body rather than the path: a squad membership
 * has no id of its own, it's the (team, player) pair.
 */
import { NextResponse } from 'next/server';
import { teamMemberSchema, HTTP } from '@open-innings/shared';
import { getTeamMembers } from '@/lib/db/queries';
import { addMemberToOwnedTeam, removeMemberFromOwnedTeam } from '@/lib/services/squads';
import { readJson, handle } from '@/lib/api/respond';

type RouteParams = { params: Promise<{ id: string }> };

export const POST = handle(async (request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  const { playerId } = await readJson(request, teamMemberSchema);

  await addMemberToOwnedTeam(id, playerId);

  const members = await getTeamMembers(id);
  return NextResponse.json({ members }, { status: HTTP.ok });
});

export const DELETE = handle(async (request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  const { playerId } = await readJson(request, teamMemberSchema);

  await removeMemberFromOwnedTeam(id, playerId);

  const members = await getTeamMembers(id);
  return NextResponse.json({ members }, { status: HTTP.ok });
});
