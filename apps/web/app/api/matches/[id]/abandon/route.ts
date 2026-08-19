/**
 * POST /api/matches/[id]/abandon
 * Mark a match as abandoned (no result) due to rain, dispute, or error.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HTTP } from '@open-innings/shared';
import { abandonOwnedMatch } from '@/lib/services/matches';
import { handle, readJson } from '@/lib/api/respond';

type RouteParams = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  /** "Rain", "ground unfit". Shown on the scorecard, so it is user-facing. */
  reason: z.string().trim().max(120).optional(),
});

export const POST = handle(async (request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;

  // An empty body is a valid abandon; reason is optional.
  const { reason } = await readJson(request, bodySchema).catch(() => ({ reason: undefined }));

  const { match } = await abandonOwnedMatch(id, reason);
  return NextResponse.json({ match }, { status: HTTP.ok });
});
