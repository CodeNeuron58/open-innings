/**
 * POST /api/matches/[id]/innings — open the next innings.
 *
 * The chase, or a super over once the scores are level. Which one it is comes
 * from what has already been played rather than from the request, so a client
 * cannot ask for a super over in a match that somebody won.
 *
 * Idempotent: a double submit returns the innings that already exists rather
 * than creating a second one. The innings break and the result screen are both
 * places a nervous second tap happens.
 */
import { NextResponse } from 'next/server';
import { startNextInningsSchema, HTTP } from '@open-innings/shared';
import { startNextInnings } from '@/lib/services/matches';
import { readJson, handle } from '@/lib/api/respond';
import { requireUserId } from '@/lib/auth/local';

type RouteParams = { params: Promise<{ id: string }> };

export const POST = handle(async (request: Request, ctx: RouteParams) => {
  // Auth before the schema — see requireUserId.
  await requireUserId('Sign in to start an innings');
  const { id } = await ctx.params;
  const input = await readJson(request, startNextInningsSchema);

  const { inning, alreadyExisted } = await startNextInnings(id, input);

  return NextResponse.json({ inning }, { status: alreadyExisted ? HTTP.ok : HTTP.created });
});
