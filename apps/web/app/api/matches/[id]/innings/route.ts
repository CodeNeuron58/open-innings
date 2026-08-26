/**
 * POST /api/matches/[id]/innings
 * Opens the next innings. Idempotent.
 */
import { NextResponse } from 'next/server';
import { startNextInningsSchema, HTTP } from '@open-innings/shared';
import { openFirstInnings, startNextInnings } from '@/lib/services/matches';
import { getMatch } from '@/lib/db/queries';
import { readJson, handle, assertId } from '@/lib/api/respond';
import { requireUserId } from '@/lib/auth/local';

type RouteParams = { params: Promise<{ id: string }> };

/** Innings 1 when there is none, the next one otherwise. */
async function openOrAdvance(id: string, input: Parameters<typeof startNextInnings>[1]) {
  const match = await getMatch(id);
  if (match?.status === 'scheduled') return openFirstInnings(id, input);
  return startNextInnings(id, input);
}

export const POST = handle(async (request: Request, ctx: RouteParams) => {
  // Auth before the schema — see requireUserId.
  await requireUserId('Sign in to start an innings');
  const { id } = await ctx.params;
  assertId(id);
  const input = await readJson(request, startNextInningsSchema);

  /*
   * The first innings of a scheduled match, or the next one of a live match.
   *
   * One endpoint rather than two, because the client's question is the same
   * either way — "open the next innings, here are the three players" — and the
   * difference is a fact about the match that the server already knows.
   */
  const { inning, alreadyExisted } = await openOrAdvance(id, input);

  return NextResponse.json({ inning }, { status: alreadyExisted ? HTTP.ok : HTTP.created });
});
