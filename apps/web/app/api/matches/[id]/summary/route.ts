/**
 * GET /api/matches/[id]/summary
 * Public route providing essential match statistics for result screens and share cards.
 */
import { NextResponse } from 'next/server';
import { HTTP } from '@open-innings/shared';
import { handle, assertId } from '@/lib/api/respond';
import { matchSummaryFor } from '@/lib/services/match-summary';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  assertId(id);
  const summary = await matchSummaryFor(id);
  return NextResponse.json(summary, { status: HTTP.ok });
});
