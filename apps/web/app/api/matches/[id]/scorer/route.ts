/**
 * GET /api/matches/[id]/scorer — everything the scorer screen needs, in one call.
 *
 * The native scorer needs the replayed `MatchState`, both squads, and team
 * names. Fetching those separately would be three round trips before a scorer
 * can record a ball, on a phone at a ground on mobile data.
 *
 * The state is replayed server-side rather than shipping raw ball events for
 * the client to fold, even though the client has the same engine. The two
 * would agree — that's the point of sharing the engine — but the ball endpoint
 * already returns replayed state after every delivery, so returning it here
 * too means the screen has exactly one shape of truth to render.
 */
import { NextResponse } from 'next/server';
import { replayInnings, asInningsId, asPlayerId, type BallEventInput } from '@open-innings/scoring';
import { HTTP } from '@open-innings/shared';
import { loadMatchInProgress, getTeam, getTeamMembers, getInnings } from '@/lib/db/queries';
import { getUserId } from '@/lib/auth/local';
import { handle } from '@/lib/api/respond';
import { notFound, unauthorized } from '@/lib/services/errors';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;

  const userId = await getUserId();
  if (!userId) throw unauthorized();

  const data = await loadMatchInProgress(id).catch(() => null);
  if (!data) throw notFound('Match not found');

  const { match, currentInnings: inning, balls } = data;
  // Not-yours reads as not-found so match ids can't be probed.
  if (match.createdBy !== userId) throw notFound('Match not found');

  const [teamA, teamB, allInnings] = await Promise.all([
    getTeam(match.teamAId).catch(() => null),
    getTeam(match.teamBId).catch(() => null),
    getInnings(id),
  ]);

  // DB rows → engine input: brand the ids, and null → undefined.
  const events: BallEventInput[] = balls.map((row) => ({
    ...row,
    inningsId: asInningsId(row.inningsId),
    batsmanId: asPlayerId(row.batsmanId),
    nonStrikerId: asPlayerId(row.nonStrikerId),
    bowlerId: asPlayerId(row.bowlerId),
    wicketPlayerId: row.wicketPlayerId ? asPlayerId(row.wicketPlayerId) : undefined,
    fielderId: row.fielderId ? asPlayerId(row.fielderId) : undefined,
    wicketType: row.wicketType ?? undefined,
    commentary: row.commentary ?? undefined,
  }));

  const state = replayInnings(
    {
      matchId: match.id,
      oversPerInnings: match.oversPerInnings,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      battingTeamId: inning.battingTeamId,
      bowlingTeamId: inning.bowlingTeamId,
      inningsId: inning.id,
      inningsNumber: inning.inningsNumber as 1 | 2 | 3 | 4,
      strikerId: inning.openingStrikerId ?? '',
      nonStrikerId: inning.openingNonStrikerId ?? '',
      bowlerId: inning.openingBowlerId ?? '',
      maxWickets: inning.maxWickets,
      target: inning.target ?? undefined,
    },
    events,
  );

  const [teamAPlayers, teamBPlayers] = await Promise.all([
    getTeamMembers(match.teamAId).catch(() => []),
    getTeamMembers(match.teamBId).catch(() => []),
  ]);

  const lite = (list: typeof teamAPlayers) => list.map((p) => ({ id: p.id, fullName: p.fullName }));

  // Both squads, so the wicket sheet can offer any fielder.
  const players = [...lite(teamAPlayers), ...lite(teamBPlayers)];

  const battingSquad =
    inning.battingTeamId === match.teamAId ? lite(teamAPlayers) : lite(teamBPlayers);
  const bowlingSquad =
    inning.bowlingTeamId === match.teamAId ? lite(teamAPlayers) : lite(teamBPlayers);

  const teamName = (teamId: string) =>
    teamId === match.teamAId ? (teamA?.name ?? 'Team A') : (teamB?.name ?? 'Team B');

  // The innings break: innings 1 is done and the chase hasn't been opened yet.
  const firstInnings = allInnings.find((i) => i.inningsNumber === 1);
  const secondInnings = allInnings.find((i) => i.inningsNumber === 2);
  const awaitingSecondInnings =
    match.status !== 'completed' &&
    firstInnings?.status === 'completed' &&
    secondInnings === undefined;

  return NextResponse.json(
    {
      state,
      players,
      battingSquad,
      bowlingSquad,
      battingTeamName: teamName(inning.battingTeamId),
      bowlingTeamName: teamName(inning.bowlingTeamId),
      matchTitle: match.title,
      matchStatus: match.status,
      matchSummary: match.summary,
      awaitingSecondInnings,
      // The chase needs openers from the sides swapped round.
      nextBattingSquad: awaitingSecondInnings ? bowlingSquad : [],
      nextBowlingSquad: awaitingSecondInnings ? battingSquad : [],
      firstInningsRuns: firstInnings?.runs ?? null,
    },
    { status: HTTP.ok },
  );
});
