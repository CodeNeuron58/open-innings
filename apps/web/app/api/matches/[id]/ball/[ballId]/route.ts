/**
 * PATCH /api/matches/[id]/ball/[ballId]
 * Correct an earlier delivery. Recomputes the entire innings after the correction
 * to handle cascading changes (e.g. strike rotation) and returns the modified state.
 * Refuses corrections that invalidate subsequent recorded deliveries.
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
import { readJson, toErrorResponse, assertId } from '@/lib/api/respond';
import { buildSeed } from '@/lib/services/innings-seed';
import { correctBall, BallCorrectionError, type StoredBall } from '@/lib/services/ball-correction';

type RouteParams = { params: Promise<{ id: string; ballId: string }> };

export async function PATCH(request: NextRequest, ctx: RouteParams) {
  const { id: matchId, ballId } = await ctx.params;
  assertId(matchId);
  assertId(ballId);

  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to score' }, { status: HTTP.unauthorized });
    }

    // Tighter rate limit for corrections as they require full innings replay.
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

    // Only allow correcting the current innings to avoid cascading target invalidations.
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

    // Fetch player names for readable diagnostics.
    const names = await playerNames(balls);

    const correction = correctBall(
      buildSeed(match, currentInnings),
      balls as StoredBall[],
      ballId,
      patch,
      (id) => names[id] ?? 'a player',
    );

    const updated = correction.state.currentInnings;

    // Reopen match if a correction un-finishes a chase.
    const reopenMatchId =
      match.status === 'completed' && updated.status !== 'completed' ? matchId : undefined;

    const written = await replaceBallSequence(
      currentInnings.id,
      correction.rewritten.map((b) => ({
        id: b.id,
        overNumber: b.overNumber,
        eventType: b.eventType,
        runsOffBat: b.runsOffBat,
        overthrowRuns: b.overthrowRuns,
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

    // Guard against concurrent innings modifications.
    if (!written) {
      return NextResponse.json(
        {
          error: 'The innings moved on while you were correcting it. Refresh and try again.',
          code: 'INNINGS_CHANGED',
        },
        { status: HTTP.conflict },
      );
    }

    // Handle corrections that finish a live chase.
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
    // Format BallCorrectionError specifically to include broken delivery context.
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
