/**
 * GET    /api/matches/[id] — match, innings, and current state.
 * DELETE /api/matches/[id] — delete it and everything scored in it.
 */
import { NextResponse } from 'next/server';
import { HTTP } from '@open-innings/shared';
import { getMatch, getInnings } from '@/lib/db/queries';
import { deleteOwnedMatch } from '@/lib/services/matches';
import { getUserId } from '@/lib/auth/local';
import { handle } from '@/lib/api/respond';
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

export const DELETE = handle(async (_request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  await deleteOwnedMatch(id);
  return NextResponse.json({ deleted: true }, { status: HTTP.ok });
});
