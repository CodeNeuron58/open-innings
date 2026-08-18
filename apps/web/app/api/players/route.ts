/**
 * GET  /api/players — the players you created, or a search across all of them.
 * POST /api/players — add a player.
 *
 * ## Why this route grew a search
 *
 * It listed `players` scoped to `createdBy`, and that was the whole of player
 * discovery. It is also why the product's central claim was false: a career
 * could not follow a person between clubs, because two clubs scoring the same
 * cricketer created two rows and two half-careers with nothing able to join
 * them. The add-a-player screen was built on the premise that searching finds
 * an *existing* player. It could not.
 *
 * `?q=` searches by name. `?scope=all` searches every account rather than
 * only yours, and returns the career context — matches, runs, wickets, recent
 * clubs — that lets a scorer tell two people with one name apart.
 *
 * Nothing is disclosed that was not already public: every career page at
 * `/p/<id>` is unauthenticated and is the thing people share. What is new is
 * being able to find it before creating a duplicate.
 *
 * No `q` keeps the old behaviour exactly, so existing clients are unaffected.
 */
import { NextResponse } from 'next/server';
import {
  createPlayerSchema,
  playerSearchSchema,
  HTTP,
  type PlayerSearchResult,
} from '@open-innings/shared';
import { listPlayers, searchPlayersByName, clubsForPlayers } from '@/lib/db/queries';
import { careerBriefsFor } from '@/lib/db/stats';
import { createPlayerFor } from '@/lib/services/squads';
import { readJson, handle } from '@/lib/api/respond';
import { requireUserId, getUserId } from '@/lib/auth/local';
import { ServiceError } from '@/lib/services/errors';

export const GET = handle(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const q = params.get('q');

  if (!q) {
    // Scoped to the session inside the query layer; returns [] when signed out.
    const players = await listPlayers();
    return NextResponse.json({ players }, { status: HTTP.ok });
  }

  const parsed = playerSearchSchema.safeParse({
    q,
    scope: params.get('scope') ?? undefined,
    limit: params.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ServiceError(
      issue?.message ?? 'Invalid search',
      HTTP.badRequest,
      issue?.path.join('.'),
    );
  }
  const { scope, limit } = parsed.data;

  const userId = await getUserId();
  const { rows, truncated } = await searchPlayersByName(parsed.data.q, scope, limit);

  const ids = rows.map((p) => p.id);
  // Both are bounded by `limit`, and neither depends on the other.
  const [briefs, clubs] = await Promise.all([careerBriefsFor(ids), clubsForPlayers(ids)]);
  const briefFor = new Map(briefs.map((b) => [b.playerId, b]));

  const players: PlayerSearchResult[] = rows.map((p) => {
    const brief = briefFor.get(p.id);
    return {
      id: p.id,
      fullName: p.fullName,
      shortName: p.shortName,
      battingStyle: p.battingStyle,
      bowlingStyle: p.bowlingStyle,
      role: p.role,
      isMine: userId !== null && p.createdBy === userId,
      // Whether *somebody* claimed them, never who. The useful question is
      // "is this a person or a stub", and the owner's identity answers a
      // different one nobody asked.
      isClaimed: p.userId !== null,
      matches: brief?.matches ?? 0,
      runs: brief?.runs ?? 0,
      wickets: brief?.wickets ?? 0,
      clubs: clubs[p.id] ?? [],
    };
  });

  return NextResponse.json({ players, scope, truncated }, { status: HTTP.ok });
});

export const POST = handle(async (request: Request) => {
  // Auth before the schema — see requireUserId.
  await requireUserId('Sign in to add a player');
  const input = await readJson(request, createPlayerSchema);
  const player = await createPlayerFor(input);
  return NextResponse.json({ player }, { status: HTTP.created });
});
