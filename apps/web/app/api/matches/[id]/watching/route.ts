/**
 * POST /api/matches/[id]/watching — "I am still here."
 *
 * A heartbeat from anyone reading a live scorecard, so the scorer can see how
 * many people are watching the game they are tapping through. That number is
 * the payoff for three hours of unpaid work, and it was the only real thing
 * behind the follower counts in the designs.
 *
 * Public and unauthenticated, because the page it comes from is. Most people
 * watching a match have no account and never will — requiring one would count
 * the wrong number and miss the point.
 *
 * `watcherKey` is an anonymous id the client generates and keeps. It
 * identifies a browser or a device, never a person; nothing joins it to a
 * user, and the only thing ever read back out is a count.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HTTP } from '@open-innings/shared';
import { handle, readJson } from '@/lib/api/respond';
import { enforceRateLimit } from '@/lib/api/request-meta';
import { countWatching, markWatching } from '@/lib/services/watching';

type RouteParams = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  // Bounded because it lands in a text column on an unauthenticated endpoint.
  // The client sends a uuid; the length is the only thing worth enforcing.
  watcherKey: z.string().trim().min(8).max(64),
});

export const POST = handle(async (request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;

  /*
   * Generous, and it has to be.
   *
   * The page beats every ten seconds — six a minute per viewer — and Indian
   * mobile carriers run CGNAT, so an entire club watching from the same
   * network shares one address. A tight cap here would silence the count for
   * exactly the audience it exists to measure. The write is an upsert keyed
   * on (match, watcher), so volume alone cannot grow the table.
   */
  enforceRateLimit(request, 'watching', { max: 600, windowMs: 60 * 1000 });

  const { watcherKey } = await readJson(request, bodySchema);
  await markWatching(id, watcherKey);

  // Returned so the caller does not need a second request to render it.
  return NextResponse.json({ watching: await countWatching(id) }, { status: HTTP.ok });
});
