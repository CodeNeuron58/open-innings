/**
 * POST /api/matches/[id]/innings — open the second innings (start the chase).
 *
 * Idempotent: a double submit returns the innings that already exists rather
 * than creating a second one. The scorer's innings-break screen is exactly
 * where a nervous double-tap happens.
 */
import { NextResponse } from 'next/server';
import { startSecondInningsSchema, HTTP } from '@open-innings/shared';
import { startSecondInnings } from '@/lib/services/matches';
import { readJson, handle } from '@/lib/api/respond';
import { requireUserId } from '@/lib/auth/local';

type RouteParams = { params: Promise<{ id: string }> };

export const POST = handle(async (request: Request, ctx: RouteParams) => {
  // Auth before the schema — see requireUserId.
  await requireUserId('Sign in to start an innings');
  const { id } = await ctx.params;
  const input = await readJson(request, startSecondInningsSchema);

  const { inning, alreadyExisted } = await startSecondInnings(id, input);

  return NextResponse.json({ inning }, { status: alreadyExisted ? HTTP.ok : HTTP.created });
});
