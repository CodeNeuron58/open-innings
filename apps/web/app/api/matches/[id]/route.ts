/**
 * GET    /api/matches/[id] — match, innings, and current state.
 * PATCH  /api/matches/[id] — correct what it says about itself.
 * DELETE /api/matches/[id] — delete it and everything scored in it.
 */
import { NextResponse } from 'next/server';
import { HTTP, updateMatchSchema } from '@open-innings/shared';
import { getMatch, getInnings } from '@/lib/db/queries';
import { deleteOwnedMatch, updateOwnedMatch } from '@/lib/services/matches';
import { getUserId } from '@/lib/auth/local';
import { handle, readJson } from '@/lib/api/respond';
import { notFound, unauthorized } from '@/lib/services/errors';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;

  const userId = await getUserId();
  if (!userId) throw unauthorized();

  const match = await getMatch(id);
  if (!match || match.createdBy !== userId) throw notFound('Match not found');

  const innings = await getInnings(id);
  return NextResponse.json({ match, innings }, { status: HTTP.ok });
});

/**
 * A match was permanent the moment it was created. The title and the venue are
 * cosmetic; `oversPerInnings` is not — set it wrong at the toss and the innings
 * ends at the wrong point, with no way back short of deleting the match.
 *
 * The teams and the toss stay fixed. Every recorded ball names players from
 * the squads that were picked, and the innings rows already carry the answer
 * the toss produced.
 */
export const PATCH = handle(async (request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  const input = await readJson(request, updateMatchSchema);

  const match = await updateOwnedMatch(id, input);
  return NextResponse.json({ match }, { status: HTTP.ok });
});

export const DELETE = handle(async (_request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  await deleteOwnedMatch(id);
  return NextResponse.json({ deleted: true }, { status: HTTP.ok });
});
