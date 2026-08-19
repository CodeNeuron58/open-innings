/**
 * GET  /api/players — list your players or search all players (`?q=`, `?scope=all`).
 * POST /api/players — add a player.
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
      // True if claimed by any user.
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
