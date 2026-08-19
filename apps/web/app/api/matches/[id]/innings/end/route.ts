/**
 * POST /api/matches/[id]/innings/end
 * Close the innings in progress manually.
 */
import { NextResponse } from 'next/server';
import { HTTP } from '@open-innings/shared';
import { endCurrentInnings } from '@/lib/services/matches';
import { handle, assertId } from '@/lib/api/respond';

type RouteParams = { params: Promise<{ id: string }> };

export const POST = handle(async (_request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  assertId(id);
  const { match, inning } = await endCurrentInnings(id);
  return NextResponse.json({ match, inning }, { status: HTTP.ok });
});
