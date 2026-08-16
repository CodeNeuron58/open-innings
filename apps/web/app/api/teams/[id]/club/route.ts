/**
 * GET /api/teams/[id]/club — a club's public home.
 *
 * `clubPageFor` already backed the web page at /c/[teamId]. The app's club
 * screen shows the same thing, so it reads the same service rather than
 * assembling squad, results and leaders from three separate calls.
 *
 * Public, like the career page and the scorecard. A club's URL is something
 * they put in an Instagram bio; it cannot need a login.
 */
import { NextResponse } from 'next/server';
import { HTTP } from '@open-innings/shared';
import { handle } from '@/lib/api/respond';
import { clubPageFor } from '@/lib/services/club';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  const club = await clubPageFor(id);

  return NextResponse.json(
    {
      ...club,
      // playedAt is a Date from the service and would serialise as an ISO
      // string anyway; doing it here makes the contract explicit rather than
      // leaving the client to discover it.
      results: club.results.map((r) => ({
        ...r,
        playedAt: r.playedAt ? r.playedAt.toISOString() : null,
      })),
    },
    { status: HTTP.ok },
  );
});
