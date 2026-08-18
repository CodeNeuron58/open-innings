/**
 * PATCH /api/matches/[id]/ball/[ballId] — correct a delivery already recorded.
 *
 * The gap this closes is the one every match hits. `DELETE .../ball` removes
 * the last delivery, so a scorer who notices at the end of an over that the
 * third ball was wrong had to undo four and re-enter them from memory, in
 * front of everyone, with the game waiting.
 *
 * ## The whole innings is recomputed
 *
 * A correction is not local. One run instead of two rotates the strike, so
 * every delivery after it was faced by the other batter — and whether that is
 * even legal depends on what happened in between. `correctBall` replays the
 * innings from the seed and hands back every delivery from the edit onward as
 * it now stands; `replaceBallSequence` writes them and the score together.
 *
 * ## What comes back
 *
 * The new state, and **what changed as a consequence**. That second part is
 * the difference between a feature a scorer will use and one they will not
 * trust: a card that silently rearranges itself is indistinguishable from a
 * bug, and the server is the only thing that knows the strike moved on balls
 * 4 through 9.
 *
 * ## What it refuses
 *
 * Corrections that make a later delivery impossible — a wide inserted into an
 * over pushes a delivery past the sixth, and whoever started the next over is
 * now changing mid-over. The refusal names the delivery, because mid-match
 * "not allowed" is useless and "ball 7 (1.6)" is something to act on.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { patchBallSchema, HTTP } from '@open-innings/shared';
import {
  loadMatchInProgress,
  replaceBallSequence,
  completeMatch,
  getTeam,
  getPlayerNamesByIds,
} from '@/lib/db/queries';
import { getUserId } from '@/lib/auth/local';
import { computeMatchResult, formatMatchResult } from '@/lib/match-result';
import { enforceRateLimit } from '@/lib/api/request-meta';
import { readJson, toErrorResponse } from '@/lib/api/respond';
import { buildSeed } from '@/lib/services/innings-seed';
import { correctBall, BallCorrectionError, type StoredBall } from '@/lib/services/ball-correction';

type RouteParams = { params: Promise<{ id: string; ballId: string }> };

export async function PATCH(request: NextRequest, ctx: RouteParams) {
  const { id: matchId, ballId } = await ctx.params;

  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to score' }, { status: HTTP.unauthorized });
    }

    /*
     * Tighter than POST, and deliberately.
     *
     * Recording is six taps an over and a correction is a considered act, so
     * a lower cap costs a real scorer nothing. It costs a loop a great deal:
     * each of these replays the innings twice and rewrites every delivery
     * after the edit, which is the most expensive thing this API does.
     */
    enforceRateLimit(request, 'ball-correct', { max: 30, windowMs: 60_000, identity: userId });

    const patch = await readJson(request, patchBallSchema);

    const loaded = await loadMatchInProgress(matchId);
    if (!loaded) {
      return NextResponse.json({ error: 'Match not found' }, { status: HTTP.notFound });
    }
    const { match, currentInnings, balls } = loaded;
    if (match.createdBy !== userId) {
      return NextResponse.json(
        { error: 'Only the match owner can score this match' },
        { status: HTTP.forbidden },
      );
    }

    /*
     * The current innings only.
     *
     * Correcting a *finished* innings is a real thing to want and a different
     * feature: it reopens a completed match, invalidates a result that has
     * already been shared, and has to replay innings that follow it. Refusing
     * it here with a reason is honest; quietly corrupting the second innings'
     * target would not be.
     */
    const index = balls.findIndex((b) => b.id === ballId);
    if (index === -1) {
      return NextResponse.json(
        {
          error:
            'That delivery is not in the innings being scored. Only the current innings can be corrected.',
          code: 'BALL_NOT_IN_CURRENT_INNINGS',
        },
        { status: HTTP.conflict },
      );
    }

    // Names make the diagnostics and the change list readable. Every player
    // who appears on any delivery, in one round trip.
    const names = await playerNames(balls);

    const correction = correctBall(
      buildSeed(match, currentInnings),
      balls as StoredBall[],
      ballId,
      patch,
      (id) => names[id] ?? 'a player',
    );

    const updated = correction.state.currentInnings;

    /*
     * Undoing the winning run is part of the same write.
     *
     * A correction can un-finish a chase — the scorer recorded four when it
     * was three, and the match was never actually won. Reopening the match
     * has to happen with the rewritten deliveries, not after them, or a
     * failure in between leaves a completed match whose ball log says the
     * target was never reached.
     */
    const reopenMatchId =
      match.status === 'completed' && updated.status !== 'completed' ? matchId : undefined;

    const written = await replaceBallSequence(
      currentInnings.id,
      correction.rewritten.map((b) => ({
        id: b.id,
        overNumber: b.overNumber,
        eventType: b.eventType,
        runsOffBat: b.runsOffBat,
        extraRuns: b.extraRuns,
        totalRuns: b.totalRuns,
        isLegalDelivery: b.isLegalDelivery,
        isFreeHit: b.isFreeHit,
        batsmanId: String(b.batsmanId),
        nonStrikerId: String(b.nonStrikerId),
        bowlerId: String(b.bowlerId),
        wicketType: b.wicketType ?? null,
        wicketPlayerId: b.wicketPlayerId ? String(b.wicketPlayerId) : null,
        fielderId: b.fielderId ? String(b.fielderId) : null,
        bowlerReplacedMidOver: b.bowlerReplacedMidOver ?? false,
        commentary: b.commentary ?? null,
      })),
      {
        runs: updated.runs,
        wickets: updated.wickets,
        ballsBowled: updated.ballsBowled,
        extras: updated.extras,
        status: updated.status,
      },
      { expectedTotal: balls.length, reopenMatchId },
    );

    // Something else changed the innings between the replay and the write.
    // The correction describes deliveries that are no longer there.
    if (!written) {
      return NextResponse.json(
        {
          error: 'The innings moved on while you were correcting it. Refresh and try again.',
          code: 'INNINGS_CHANGED',
        },
        { status: HTTP.conflict },
      );
    }

    /*
     * A correction can also *finish* a chase that was still live — the scorer
     * recorded three when it was four. Same shape as POST, and the same
     * reason for the catch: the deliveries are already written, so a failed
     * result write must not fail the request.
     */
    if (
      updated.status === 'completed' &&
      currentInnings.inningsNumber >= 2 &&
      typeof updated.target === 'number'
    ) {
      try {
        const result = computeMatchResult({
          runs: updated.runs,
          wickets: updated.wickets,
          target: updated.target,
          maxWickets: updated.maxWickets,
          battingTeamId: currentInnings.battingTeamId,
          bowlingTeamId: currentInnings.bowlingTeamId,
        });
        const winner = result.winningTeamId
          ? await getTeam(result.winningTeamId).catch(() => null)
          : null;
        await completeMatch(matchId, {
          result:
            result.winningTeamId === null
              ? 'tie'
              : result.winningTeamId === match.teamAId
                ? 'team_a_win'
                : 'team_b_win',
          winningTeamId: result.winningTeamId,
          summary: formatMatchResult(result, winner?.name),
        });
      } catch (err) {
        console.error('Failed to finalize match result after correction', err);
      }
    }

    return NextResponse.json({
      state: correction.state,
      changes: correction.changes,
      rewritten: correction.rewritten.length,
    });
  } catch (err) {
    // A rejection names the delivery it broke, which no generic mapper can
    // do — so it is serialised here and everything else falls through.
    if (err instanceof BallCorrectionError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          ...(err.ballNumber !== undefined ? { ballNumber: err.ballNumber } : {}),
          ...(err.over !== undefined ? { over: err.over } : {}),
        },
        { status: err.status },
      );
    }
    return toErrorResponse(err);
  }
}

/** Every player named on any delivery, resolved in one query. */
async function playerNames(
  balls: ReadonlyArray<{
    batsmanId: string;
    nonStrikerId: string;
    bowlerId: string;
    wicketPlayerId: string | null;
    fielderId: string | null;
  }>,
): Promise<Record<string, string>> {
  const ids = new Set<string>();
  for (const b of balls) {
    ids.add(b.batsmanId);
    ids.add(b.nonStrikerId);
    ids.add(b.bowlerId);
    if (b.wicketPlayerId) ids.add(b.wicketPlayerId);
    if (b.fielderId) ids.add(b.fielderId);
  }
  return getPlayerNamesByIds([...ids]);
}
