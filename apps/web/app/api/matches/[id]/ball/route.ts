/**
 * POST /api/matches/[id]/ball — record a ball event.
 * Replays state, applies event, persists, and updates cache columns.
 *
 * DELETE /api/matches/[id]/ball — undo the last ball.
 * Deletes the last event and recomputes state.
 */

import { type NextRequest, NextResponse } from 'next/server';
import {
  applyBall,
  replayEvents,
  ScoringError,
  asInningsId,
  asPlayerId,
  type BallEventInput,
  type MatchState,
} from '@open-innings/scoring';
import {
  ballByRequestId,
  completeMatch,
  getTeam,
  loadMatchInProgress,
  recordBall,
  removeLastBall,
} from '@/lib/db/queries';
import { getUserId } from '@/lib/auth/local';
import { computeMatchResult, formatMatchResult } from '@/lib/match-result';
import { consistentBallEventSchema } from '@open-innings/shared';
import { enforceRateLimit } from '@/lib/api/request-meta';
import { readJson, toErrorResponse, assertId } from '@/lib/api/respond';
import { buildSeed } from '@/lib/services/innings-seed';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteParams) {
  const { id: matchId } = await ctx.params;
  assertId(matchId);

  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to score' }, { status: 401 });
    }

    // Rate limit keyed on the scorer (not IP) to support multiple scorers on same NAT.
    enforceRateLimit(request, 'ball', { max: 120, windowMs: 60_000, identity: userId });

    // Parse input using schema to ensure valid event types.
    const parsed = await readJson(request, consistentBallEventSchema);

    const loaded = await loadMatchInProgress(matchId);
    if (!loaded) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }
    const { match, currentInnings, balls } = loaded;
    if (match.createdBy !== userId) {
      return NextResponse.json(
        { error: 'Only the match owner can score this match' },
        { status: 403 },
      );
    }

    /*
     * Already recorded under this id? Then this is a retry of a request that
     * succeeded and whose response never arrived, and the honest answer is
     * the success the scorer did not get to see — not a 409, which would show
     * as an error for a ball that is already on the scorecard.
     *
     * The check is a read, so it loses a genuine race. The partial unique
     * index from migration 0013 catches that case, and `respond.ts` maps the
     * violation.
     */
    if (parsed.requestId) {
      const already = await ballByRequestId(currentInnings.id, parsed.requestId);
      if (already) {
        return NextResponse.json({
          state: replayEvents(buildSeed(match, currentInnings), ballsToInputs(balls)),
        });
      }
    }

    // Server-owned fields are derived, not accepted from body.
    const body: BallEventInput = {
      inningsId: asInningsId(currentInnings.id),
      eventType: parsed.eventType,
      runsOffBat: parsed.runsOffBat,
      extraRuns: parsed.extraRuns,
      batsmanId: asPlayerId(parsed.batsmanId),
      nonStrikerId: asPlayerId(parsed.nonStrikerId),
      bowlerId: asPlayerId(parsed.bowlerId),
      wicketType: parsed.wicketType,
      wicketPlayerId: parsed.wicketPlayerId ? asPlayerId(parsed.wicketPlayerId) : undefined,
      fielderId: parsed.fielderId ? asPlayerId(parsed.fielderId) : undefined,
      // Engine cannot derive Law 17.4 mid-over replacements.
      bowlerReplacedMidOver: parsed.bowlerReplacedMidOver,
      commentary: parsed.commentary,
    };

    // Reconstruct state from existing balls
    const seed = buildSeed(match, currentInnings);
    let state: MatchState;
    try {
      state = replayEvents(seed, ballsToInputs(balls));
    } catch (err) {
      console.error('Replay failed', err);
      return NextResponse.json({ error: 'Failed to replay state' }, { status: 500 });
    }

    // Apply the new event through the engine
    let nextState: MatchState;
    try {
      nextState = applyBall(state, body);
    } catch (err) {
      if (err instanceof ScoringError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json({ error: message }, { status: 500 });
    }

    // Persist the ball and move the innings on together in one transaction.
    const newBall = nextState.balls[nextState.balls.length - 1]!;
    const updated = nextState.currentInnings;

    const persisted = await recordBall(
      {
        inningsId: currentInnings.id,
        overNumber: newBall.overNumber,
        ballNumber: newBall.ballNumber,
        eventType: newBall.eventType,
        runsOffBat: newBall.runsOffBat,
        overthrowRuns: newBall.overthrowRuns,
        extraRuns: newBall.extraRuns,
        totalRuns: newBall.totalRuns,
        isLegalDelivery: newBall.isLegalDelivery,
        isFreeHit: newBall.isFreeHit,
        batsmanId: newBall.batsmanId,
        nonStrikerId: newBall.nonStrikerId,
        bowlerId: newBall.bowlerId,
        wicketType: newBall.wicketType ?? null,
        wicketPlayerId: newBall.wicketPlayerId ?? null,
        fielderId: newBall.fielderId ?? null,
        // Reserved. Nothing sends these yet — see migration 0019 — but the
        // path from client to column is wired now so that adding the capture
        // is a screen rather than a migration plus a schema plus a route.
        shotAngle: newBall.shotAngle ?? null,
        shotDistance: newBall.shotDistance ?? null,
        bowlerReplacedMidOver: newBall.bowlerReplacedMidOver ?? false,
        commentary: newBall.commentary ?? null,
        requestId: parsed.requestId ?? null,
      },
      currentInnings.id,
      {
        runs: updated.runs,
        wickets: updated.wickets,
        ballsBowled: updated.ballsBowled,
        extras: updated.extras,
        status: updated.status,
        ...(updated.status === 'completed' ? { completedAt: new Date() } : {}),
      },
      // The cache above describes the innings as it was when `balls` was read.
      // If anything has landed since — a correction from another device, most
      // plausibly — this write would overwrite it with a number computed from
      // a state that no longer exists. Refuse instead.
      balls.length,
    );

    /*
     * Give the client the row's id, not the engine's placeholder.
     *
     * `applyBall` mints a uuid for a delivery that arrives without one, and
     * Postgres mints its own on insert. They are different values, and until
     * now the response carried the engine's — an id that exists nowhere.
     *
     * That broke correcting the ball you just scored, which is exactly when a
     * scorer wants to. The app takes ball ids straight from this response and
     * sends one back to `PATCH /ball/[ballId]`, where `correctBall` looks it up
     * in the stored log, fails to find it, and answers `BALL_NOT_FOUND` — "that
     * delivery is not in this innings", about a delivery bowled seconds ago.
     *
     * It survived the smoke tests because they re-read `/scorer` before
     * correcting, which replays from the database and therefore has real ids.
     * The app does not re-read; it applies this state directly.
     */
    const responseState =
      persisted === null
        ? nextState
        : {
            ...nextState,
            balls: nextState.balls.map((b, i) =>
              i === nextState.balls.length - 1 ? { ...b, id: persisted.id } : b,
            ),
          };

    // Chase innings just finished → the match has a result.
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
          summary: formatMatchResult(result, winner?.name, {
            superOver: currentInnings.inningsNumber >= 3,
          }),
        });
      } catch (err) {
        // The ball is already saved — a failed result write must not fail the request.
        console.error('Failed to finalize match result', err);
      }
    }

    return NextResponse.json({ state: responseState });
  } catch (err) {
    // Shared mapper so a rate-limit rejection surfaces as 429 rather than
    // being flattened into a 500 alongside genuine faults.
    return toErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest, ctx: RouteParams) {
  const { id: matchId } = await ctx.params;
  assertId(matchId);
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to score' }, { status: 401 });
    }

    // Undo shares the same rate limit bucket as POST.
    enforceRateLimit(request, 'ball', { max: 120, windowMs: 60_000, identity: userId });

    const loaded = await loadMatchInProgress(matchId);
    if (!loaded) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }
    const { match, currentInnings, balls } = loaded;
    if (match.createdBy !== userId) {
      return NextResponse.json(
        { error: 'Only the match owner can score this match' },
        { status: 403 },
      );
    }
    if (balls.length === 0) {
      return NextResponse.json({ error: 'No balls to undo' }, { status: 400 });
    }

    // Replay first to compute new score before hitting the database.
    const last = balls[balls.length - 1]!;
    const remaining = balls.slice(0, -1);
    const seed = buildSeed(match, currentInnings);
    const state = replayEvents(seed, ballsToInputs(remaining));

    // Reopen match if undoing the winning run.
    const reopenMatchId =
      match.status === 'completed' && state.currentInnings.status !== 'completed'
        ? matchId
        : undefined;

    const removed = await removeLastBall(
      last.id,
      currentInnings.id,
      {
        runs: state.currentInnings.runs,
        wickets: state.currentInnings.wickets,
        ballsBowled: state.currentInnings.ballsBowled,
        extras: state.currentInnings.extras,
        status: state.currentInnings.status,
      },
      { reopenMatchId },
    );

    // Another undo got there first. The score we computed describes a ball
    // that is already gone, so it must not be written.
    if (!removed) {
      return NextResponse.json(
        {
          error: 'That delivery was already undone. Refresh to see the current score.',
          code: 'ALREADY_UNDONE',
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ state });
  } catch (err) {
    // Use shared mapper for proper error status codes.
    return toErrorResponse(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function ballsToInputs(
  balls: Array<{
    inningsId: string;
    eventType: string;
    runsOffBat: number;
    extraRuns: number;
    totalRuns: number;
    isLegalDelivery: boolean;
    isFreeHit: boolean;
    batsmanId: string;
    nonStrikerId: string;
    bowlerId: string;
    wicketType: string | null;
    wicketPlayerId: string | null;
    fielderId: string | null;
    bowlerReplacedMidOver: boolean;
    commentary: string | null;
    id: string;
  }>,
): BallEventInput[] {
  return balls.map((b) => ({
    inningsId: asInningsId(b.inningsId),
    eventType: b.eventType as BallEventInput['eventType'],
    runsOffBat: b.runsOffBat,
    extraRuns: b.extraRuns,
    totalRuns: b.totalRuns,
    isLegalDelivery: b.isLegalDelivery,
    isFreeHit: b.isFreeHit,
    batsmanId: asPlayerId(b.batsmanId),
    nonStrikerId: asPlayerId(b.nonStrikerId),
    bowlerId: asPlayerId(b.bowlerId),
    wicketType: (b.wicketType ?? undefined) as BallEventInput['wicketType'],
    wicketPlayerId: b.wicketPlayerId ? asPlayerId(b.wicketPlayerId) : undefined,
    fielderId: b.fielderId ? asPlayerId(b.fielderId) : undefined,
    bowlerReplacedMidOver: b.bowlerReplacedMidOver,
    commentary: b.commentary ?? undefined,
    id: b.id,
  }));
}
