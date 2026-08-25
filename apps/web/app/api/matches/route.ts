/**
 * GET  /api/matches — matches the signed-in user created.
 * POST /api/matches — create a match, open innings 1, go live.
 */
import { NextResponse } from 'next/server';
import { createMatchSchema, HTTP } from '@open-innings/shared';
import { listMatches, inningsLinesFor, teamNamesFor } from '@/lib/db/queries';
import { countWatchingFor } from '@/lib/services/watching';
import { createMatchWithFirstInnings } from '@/lib/services/matches';
import { readJson, handle } from '@/lib/api/respond';
import { requireUserId } from '@/lib/auth/local';

export const GET = handle(async () => {
  const matches = await listMatches();

  /*
   * Three grouped queries for the whole list, not three per row.
   *
   * The list used to carry no score at all: a match in progress showed its
   * title, ground, format and over count — everything except where it had got
   * to. Knowing whether your side was 40 for 2 or 140 for 8 meant opening the
   * match. It is the one question a list of live matches exists to answer, and
   * it is what every comparable app leads with.
   *
   * It could not carry the team names either, only their ids, so an untitled
   * match had nothing to call itself but "Match".
   */
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

export const POST = handle(async (request: Request) => {
  // Auth before the schema — see requireUserId.
  await requireUserId('Sign in to create a match');

  const input = await readJson(request, createMatchSchema);
  const { match, inning } = await createMatchWithFirstInnings(input);
  return NextResponse.json({ match, inning }, { status: HTTP.created });
});
