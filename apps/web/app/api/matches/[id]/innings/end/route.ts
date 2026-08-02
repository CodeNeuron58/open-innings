/**
 * POST /api/matches/[id]/innings/end — close the innings in progress.
 *
 * The manual escape hatch for short squads: a six-a-side team can't lose ten
 * wickets, so it can never go "all out" on its own. Ending the chase early
 * also settles the match.
 */
import { NextResponse } from 'next/server';
import { HTTP } from '@open-innings/shared';
import { endCurrentInnings } from '@/lib/services/matches';
import { handle } from '@/lib/api/respond';

type RouteParams = { params: Promise<{ id: string }> };

export const POST = handle(async (_request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  const { match, inning } = await endCurrentInnings(id);
  return NextResponse.json({ match, inning }, { status: HTTP.ok });
});
