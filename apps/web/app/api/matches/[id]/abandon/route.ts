/**
 * POST /api/matches/[id]/abandon — rain, a dispute, or a match started by
 * mistake.
 *
 * A no result is a real outcome in cricket and is not a tie, so it is recorded
 * as one rather than faked as a scoreline nobody played to. `matches.status`
 * has carried 'abandoned' and `matches.result` has carried 'no_result' since
 * the first migration; nothing had ever written either.
 *
 * It is also the way out of a dead end. `deleteOwnedMatch` refuses while a
 * match is live and tells the caller to "finish or abandon" it — and there was
 * no way to abandon anything, so a match created with the wrong teams, or
 * rained off before a result, stayed live and undeletable forever, on the
 * match list and in every career figure it touched.
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

  // An empty body is a valid abandon — a reason is worth having and is not
  // worth blocking on, least of all from someone packing up in the rain.
  const { reason } = await readJson(request, bodySchema).catch(() => ({ reason: undefined }));

  const { match } = await abandonOwnedMatch(id, reason);
  return NextResponse.json({ match }, { status: HTTP.ok });
});
