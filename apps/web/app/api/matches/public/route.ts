/**
 * GET /api/matches/public — matches anyone can watch, live ones first.
 *
 * No session required, and deliberately so. Every match here is already
 * readable without one: the RLS policy makes `matches` public, `/m/<id>` is
 * the link people share, and the card endpoint behind it takes no token.
 *
 * What this adds is discovery. A guest used to land on a box asking them to
 * paste a URL — no link, nothing to do — and the endpoints to fix that already
 * existed. Only the listing was missing.
 */
import { NextResponse } from 'next/server';
import { HTTP } from '@open-innings/shared';
import { listPublicMatches, inningsLinesFor, teamNamesFor } from '@/lib/db/queries';
import { countWatchingFor } from '@/lib/services/watching';
import { handle } from '@/lib/api/respond';

/**
 * Enough to fill a screen and stop.
 *
 * This is a way in, not a directory. A longer list is a scrolling problem
 * rather than a discovery one, and paging it would mean promising an ordering
 * that stays stable while matches go live underneath it.
 */
const LIMIT = 30;

export const GET = handle(async () => {
  const matches = await listPublicMatches(LIMIT);

  // The same three grouped queries the owner's list uses, for the same reason:
  // a row without a score is not worth listing.
  const ids = matches.map((m) => m.id);
  const [watching, lines, teamNames] = await Promise.all([
    countWatchingFor(ids),
    inningsLinesFor(ids),
    teamNamesFor(matches.flatMap((m) => [m.teamAId, m.teamBId])),
  ]);

  return NextResponse.json(
    {
      matches: matches.map((m) => ({
        ...m,
        watching: watching.get(m.id) ?? 0,
        teamAName: teamNames.get(m.teamAId) ?? null,
        teamBName: teamNames.get(m.teamBId) ?? null,
        innings: lines.get(m.id) ?? [],
      })),
    },
    { status: HTTP.ok },
  );
});
