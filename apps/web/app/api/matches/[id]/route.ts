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
import { handle, readJson, assertId } from '@/lib/api/respond';
import { notFound, unauthorized } from '@/lib/services/errors';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  assertId(id);

  const userId = await getUserId();
  if (!userId) throw unauthorized();

  const match = await getMatch(id);
  if (!match || match.createdBy !== userId) throw notFound('Match not found');

  const innings = await getInnings(id);
  return NextResponse.json({ match, innings }, { status: HTTP.ok });
});

/**
 * Updates match metadata. Title and venue can be updated.
 * Teams and toss are fixed after creation.
 */
export const PATCH = handle(async (request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  assertId(id);
  const input = await readJson(request, updateMatchSchema);

  const match = await updateOwnedMatch(id, input);
  return NextResponse.json({ match }, { status: HTTP.ok });
});

export const DELETE = handle(async (_request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  assertId(id);
  await deleteOwnedMatch(id);
  return NextResponse.json({ deleted: true }, { status: HTTP.ok });
});
