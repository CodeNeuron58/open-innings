/**
 * POST /api/matches/[id]/innings
 * Opens the next innings. Idempotent.
 */
import { NextResponse } from 'next/server';
import { startNextInningsSchema, HTTP } from '@open-innings/shared';
import { startNextInnings } from '@/lib/services/matches';
import { readJson, handle, assertId } from '@/lib/api/respond';
import { requireUserId } from '@/lib/auth/local';

type RouteParams = { params: Promise<{ id: string }> };

export const POST = handle(async (request: Request, ctx: RouteParams) => {
  // Auth before the schema — see requireUserId.
  await requireUserId('Sign in to start an innings');
  const { id } = await ctx.params;
  assertId(id);
  const input = await readJson(request, startNextInningsSchema);

  const { inning, alreadyExisted } = await startNextInnings(id, input);

  return NextResponse.json({ inning }, { status: alreadyExisted ? HTTP.ok : HTTP.created });
});
