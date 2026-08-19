/**
 * POST /api/matches/[id]/watching
 * Heartbeat for live scorecard readers to update viewer counts.
 * Public and unauthenticated.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HTTP } from '@open-innings/shared';
import { handle, readJson } from '@/lib/api/respond';
import { enforceRateLimit } from '@/lib/api/request-meta';
import { countWatching, markWatching } from '@/lib/services/watching';

type RouteParams = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  // Bounded for unauthenticated text column insertion.
  watcherKey: z.string().trim().min(8).max(64),
});

export const POST = handle(async (request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;

  // Generous rate limit to support multiple viewers behind CGNAT.
  enforceRateLimit(request, 'watching', { max: 600, windowMs: 60 * 1000 });

  const { watcherKey } = await readJson(request, bodySchema);
  await markWatching(id, watcherKey);

  // Returned so the caller does not need a second request to render it.
  return NextResponse.json({ watching: await countWatching(id) }, { status: HTTP.ok });
});
