/**
 * GET  /api/matches — matches the signed-in user created.
 * POST /api/matches — create a match, open innings 1, go live.
 */
import { NextResponse } from 'next/server';
import { createMatchSchema, HTTP } from '@open-innings/shared';
import { listMatches } from '@/lib/db/queries';
import { countWatchingFor } from '@/lib/services/watching';
import { createMatchWithFirstInnings } from '@/lib/services/matches';
import { readJson, handle } from '@/lib/api/respond';
import { requireUserId } from '@/lib/auth/local';

export const GET = handle(async () => {
  const matches = await listMatches();

  // One grouped query for the whole list rather than one per row. Matches
  // nobody is watching are absent from the map, so they default to zero.
  const watching = await countWatchingFor(matches.map((m) => m.id));

  return NextResponse.json(
    { matches: matches.map((m) => ({ ...m, watching: watching.get(m.id) ?? 0 })) },
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
