/**
 * GET /api/matches/[id]/scorer
 * Returns complete MatchState, squads, and team names in one call.
 * State is replayed server-side to provide a single source of truth.
 */
import { NextResponse } from 'next/server';
import { replayInnings, type BallEventInput } from '@open-innings/scoring';
import { HTTP } from '@open-innings/shared';
import { toBallEventInputs } from '@/lib/ball-input';
import { loadMatchInProgress, getTeam, getInnings } from '@/lib/db/queries';
import { squadFor } from '@/lib/services/matches';
import { getUserId } from '@/lib/auth/local';
import { handle, assertId } from '@/lib/api/respond';
import { countWatching } from '@/lib/services/watching';
import { notFound, unauthorized } from '@/lib/services/errors';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  assertId(id);

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

  // DB rows → engine input. One mapper, shared — see lib/ball-input.ts.
  const events: BallEventInput[] = toBallEventInputs(balls);

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
      // Replay must see the same conditions the delivery was validated under.
      maxOversPerBowler: match.maxOversPerBowler ?? undefined,
    },
    events,
  );

  /*
   * The XI, not the club's whole roster.
   *
   * `squadFor` falls back to the roster where no XI was named, so matches
   * created before migration 0018 are unchanged — but where a side was
   * actually picked, every list built from this is eleven names instead of
   * however many the club has registered. That is the wicket sheet's fielders,
   * the next-batter list, and the end-of-over bowler list all at once.
   */
  const [teamAPlayers, teamBPlayers] = await Promise.all([
    squadFor(match.id, match.teamAId).catch(() => []),
    squadFor(match.id, match.teamBId).catch(() => []),
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

  // The innings break: an innings is done and the chase hasn't been opened yet.
  const firstInnings = allInnings.find((i) => i.inningsNumber === 1);
  const secondInnings = allInnings.find((i) => i.inningsNumber === 2);
  const thirdInnings = allInnings.find((i) => i.inningsNumber === 3);
  const fourthInnings = allInnings.find((i) => i.inningsNumber === 4);
  const isSuperOverBreak = thirdInnings?.status === 'completed' && fourthInnings === undefined;
  const awaitingSecondInnings =
    match.status !== 'completed' &&
    ((firstInnings?.status === 'completed' && secondInnings === undefined) || isSuperOverBreak);

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
      // Who scored the last delivery, in the only terms that need no new
      // column: the request id its device minted. See ScorerResponse.
      lastBall: (() => {
        const last = balls[balls.length - 1];
        if (!last) return null;
        return { at: last.createdAt.toISOString(), requestId: last.requestId ?? null };
      })(),
      // The chase needs openers from the sides swapped round.
      nextBattingSquad: awaitingSecondInnings ? bowlingSquad : [],
      nextBowlingSquad: awaitingSecondInnings ? battingSquad : [],
      firstInningsRuns: (isSuperOverBreak ? thirdInnings?.runs : firstInnings?.runs) ?? null,
      watching: await countWatching(id),
    },
    { status: HTTP.ok },
  );
});
