/**
 * GET /api/teams/[id]/club
 * Public club home page data.
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
      // Explicitly serialize Date to ISO string.
      results: club.results.map((r) => ({
        ...r,
        playedAt: r.playedAt ? r.playedAt.toISOString() : null,
      })),
    },
    { status: HTTP.ok },
  );
});
