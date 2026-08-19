/**
 * GET /api/matches/[id]/card
 * The full match record: innings, tables, and every delivery.
 */
import { NextResponse } from 'next/server';
import { HTTP } from '@open-innings/shared';
import { handle, assertId } from '@/lib/api/respond';
import { matchCardFor } from '@/lib/services/match-summary';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  assertId(id);
  const card = await matchCardFor(id);
  return NextResponse.json(card, { status: HTTP.ok });
});
