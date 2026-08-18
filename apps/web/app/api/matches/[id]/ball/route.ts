/**
 * POST /api/matches/[id]/ball — record a ball event.
 *
 * Request body: a BallEventInput (the scorer UI's view of the ball).
 *
 * Flow:
 *   1. Load current innings + all existing ball events for it.
 *   2. Build a seed from the innings row (opening players + bowler).
 *   3. Replay existing balls through the engine to reconstruct state.
 *   4. Apply the new event through the engine (validates, may throw ScoringError).
 *   5. Persist the new event to the DB.
 *   6. Update the innings cache columns (runs, wickets, balls_bowled, extras, status).
 *   7. Return the updated MatchState so the scorer UI can re-render.
 *
 * DELETE /api/matches/[id]/ball — undo the last ball.
 *   Same flow, but deletes the last ball_events row and recomputes.
 */

import { type NextRequest, NextResponse } from 'next/server';
import {
  applyBall,
  initialState,
  replayEvents,
  ScoringError,
  asInningsId,
  asPlayerId,
  type BallEventInput,
  type MatchState,
} from '@open-innings/scoring';
import {
  loadMatchInProgress,
  recordBall,
  deleteLastBallEvent,
  updateInningCache,
  completeMatch,
  reopenMatch,
  getTeam,
} from '@/lib/db/queries';
import { getUserId } from '@/lib/auth/local';
import { computeMatchResult, formatMatchResult } from '@/lib/match-result';
import { consistentBallEventSchema } from '@open-innings/shared';
import { enforceRateLimit } from '@/lib/api/request-meta';
import { readJson, toErrorResponse } from '@/lib/api/respond';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteParams) {
  const { id: matchId } = await ctx.params;

  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to score' }, { status: 401 });
    }

    // Keyed on the scorer, not the IP — a whole club shares one IP behind
    // NAT, and throttling the second scorer in the room would be a bug.
    // Generous: a real over is six taps, this allows a sustained two a second.
    enforceRateLimit(request, 'ball', { max: 120, windowMs: 60_000, identity: userId });

    /*
     * Parsed, not cast.
     *
     * This line was `(await request.json()) as BallEventInput` — an assertion
     * that told the compiler to stop asking and let arbitrary JSON reach the
     * engine and then Postgres. `ballEventSchema` existed in the shared
     * package the whole time, describing a shape nobody sent; it now
     * describes this one and is finally used.
     *
     * The cast is how tapping 5 on the keypad became a 500: nothing between
     * the screen and the database checked the event type against the enum.
     */
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
     * Server-owned fields are not taken from the body, and the schema does not
     * accept them. `inningsId` comes from the innings this match is actually
     * on rather than whichever one the client believes; `totalRuns`,
     * `isLegalDelivery` and `isFreeHit` are the engine's to derive.
     */
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

    // Persist the ball and move the innings on, together.
    //
    // These used to be two awaits. A failure between them stored the delivery
    // and left the cached score a ball behind, with nothing to recompute it
    // but the next successful ball.
    const newBall = nextState.balls[nextState.balls.length - 1]!;
    const updated = nextState.currentInnings;

    await recordBall(
      {
        inningsId: currentInnings.id,
        overNumber: newBall.overNumber,
        ballNumber: newBall.ballNumber,
        eventType: newBall.eventType,
        runsOffBat: newBall.runsOffBat,
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
        commentary: newBall.commentary ?? null,
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
    );

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
          summary: formatMatchResult(result, winner?.name),
        });
      } catch (err) {
        // The ball is already saved — a failed result write must not fail the request.
        console.error('Failed to finalize match result', err);
      }
    }

    return NextResponse.json({ state: nextState });
  } catch (err) {
    // Shared mapper so a rate-limit rejection surfaces as 429 rather than
    // being flattened into a 500 alongside genuine faults.
    return toErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest, ctx: RouteParams) {
  const { id: matchId } = await ctx.params;
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to score' }, { status: 401 });
    }

    // Undo was the one unthrottled half of this endpoint. It costs more than
    // POST does — it deletes, then replays the whole innings from scratch —
    // so leaving it open while capping the cheaper direction had it backwards.
    // Same bucket and same key as POST: a scorer's undos and their deliveries
    // are the same person doing the same job.
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

    await deleteLastBallEvent(currentInnings.id);

    const remaining = balls.slice(0, -1);
    const seed = buildSeed(match, currentInnings);
    const state = replayEvents(seed, ballsToInputs(remaining));

    await updateInningCache(currentInnings.id, {
      runs: state.currentInnings.runs,
      wickets: state.currentInnings.wickets,
      ballsBowled: state.currentInnings.ballsBowled,
      extras: state.currentInnings.extras,
      status: state.currentInnings.status,
    });

    // Undoing the final ball of a finished chase reopens the match.
    if (match.status === 'completed' && state.currentInnings.status !== 'completed') {
      await reopenMatch(matchId);
    }

    return NextResponse.json({ state });
  } catch (err) {
    // Through the shared mapper, like POST. This used to flatten everything
    // to a 500, which would have turned the new rate-limit rejection into a
    // server fault instead of the 429 it is.
    return toErrorResponse(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type LoadedMatch = Awaited<ReturnType<typeof loadMatchInProgress>>;
type LoadedInnings = NonNullable<LoadedMatch>['currentInnings'];

function buildSeed(
  match: { id: string; oversPerInnings: number; teamAId: string; teamBId: string },
  currentInnings: LoadedInnings,
): MatchState {
  // Use the opening trio as the seed. After the first ball is recorded, the
  // engine's state will overwrite these. Until then, this is what the UI
  // shows for a fresh innings.
  const strikerId = currentInnings.openingStrikerId ?? '';
  const nonStrikerId = currentInnings.openingNonStrikerId ?? '';
  const bowlerId = currentInnings.openingBowlerId ?? '';

  return initialState({
    matchId: match.id,
    oversPerInnings: match.oversPerInnings,
    teamAId: match.teamAId,
    teamBId: match.teamBId,
    battingTeamId: currentInnings.battingTeamId,
    bowlingTeamId: currentInnings.bowlingTeamId,
    inningsId: currentInnings.id,
    inningsNumber: currentInnings.inningsNumber as 1 | 2 | 3 | 4,
    strikerId,
    nonStrikerId,
    bowlerId,
    target: currentInnings.target ?? undefined,
    maxWickets: currentInnings.maxWickets,
  });
}

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
    commentary: b.commentary ?? undefined,
    id: b.id,
  }));
}
