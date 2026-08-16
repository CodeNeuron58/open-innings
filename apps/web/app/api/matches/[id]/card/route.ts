/**
 * GET /api/matches/[id]/card — the full record: both innings, both tables,
 * and every delivery.
 *
 * Separate from `/summary`, which is the handful of facts that fit on a share
 * card. This is the heavy one — it ships the whole ball log — and the card
 * screen calls it once and then switches between the scorecard and the
 * over-by-over feed without going back to the network.
 *
 * Public, like `/summary` and the share cards. It is the same information a
 * paper scorecard carries.
 */
import { NextResponse } from 'next/server';
import { HTTP } from '@open-innings/shared';
import { handle } from '@/lib/api/respond';
import { matchCardFor } from '@/lib/services/match-summary';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  const card = await matchCardFor(id);
  return NextResponse.json(card, { status: HTTP.ok });
});
