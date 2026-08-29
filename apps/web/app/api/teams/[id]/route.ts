/**
 * GET    /api/teams/[id] — team details plus its squad.
 * PATCH  /api/teams/[id] — rename or update the team.
 * DELETE /api/teams/[id] — remove a club that has never played.
 */
import { NextResponse } from 'next/server';
import { updateTeamSchema, HTTP } from '@open-innings/shared';
import { getTeam, getTeamMembers } from '@/lib/db/queries';
import { updateOwnedTeam, deleteOwnedTeam } from '@/lib/services/squads';
import { getUserId } from '@/lib/auth/local';
import { readJson, handle, assertId } from '@/lib/api/respond';
import { notFound, unauthorized } from '@/lib/services/errors';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  assertId(id);

  const userId = await getUserId();
  if (!userId) throw unauthorized();

  const team = await getTeam(id);
  // Not-yours reads as not-found so team ids can't be probed.
  if (!team || team.ownerId !== userId) throw notFound('Team not found');

  const members = await getTeamMembers(id);
  return NextResponse.json({ team, members }, { status: HTTP.ok });
});

export const PATCH = handle(async (request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  assertId(id);
  const input = await readJson(request, updateTeamSchema);

  await updateOwnedTeam(id, input);

  const team = await getTeam(id);
  return NextResponse.json({ team }, { status: HTTP.ok });
});

export const DELETE = handle(async (_request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  assertId(id);

  // Refuses with a 409 when the club is named in a fixture — deleting it would
  // leave those matches without a side. See `deleteOwnedTeam`.
  await deleteOwnedTeam(id);

  return NextResponse.json({ deleted: true }, { status: HTTP.ok });
});
