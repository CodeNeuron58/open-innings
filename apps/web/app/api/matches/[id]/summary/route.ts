/**
 * GET /api/matches/[id]/summary — the match reduced to what the result screen
 * shows.
 *
 * `matchSummaryFor` already existed for the share cards. The app needs exactly
 * the same facts — result line, both innings, top scorer, best bowling, most
 * sixes, player of the match — so this route exposes the service rather than
 * recomputing them on the phone.
 *
 * The phone could not do it anyway: `/scorer` replays only the innings being
 * scored, and a result needs both. Folding both innings client-side would mean
 * shipping every ball of the match to a device on ground-side mobile data, and
 * "top scorer" would then be computed in two places that could disagree.
 *
 * Public, like the share cards it feeds. A result is the artifact people send
 * to a group chat, and a scorecard nobody can open is not one. Nothing here is
 * private — it is the same information printed on a paper scorecard and pinned
 * to a clubhouse wall.
 */
import { NextResponse } from 'next/server';
import { HTTP } from '@open-innings/shared';
import { handle } from '@/lib/api/respond';
import { matchSummaryFor } from '@/lib/services/match-summary';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  const summary = await matchSummaryFor(id);
  return NextResponse.json(summary, { status: HTTP.ok });
});
