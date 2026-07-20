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
import { applyBall, initialState, replayEvents, ScoringError } from '@/lib/scoring';
import type { BallEventInput, MatchState } from '@/lib/scoring/types';
import { asInningsId, asPlayerId } from '@/lib/scoring/types';
import {
  loadMatchInProgress,
  insertBallEvent,
  deleteLastBallEvent,
  updateInningCache,
  completeMatch,
  reopenMatch,
  getTeam,
} from '@/lib/db/queries';
import { getUserId } from '@/lib/auth/local';
import { computeMatchResult, formatMatchResult } from '@/lib/match-result';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteParams) {
  const { id: matchId } = await ctx.params;

  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to score' }, { status: 401 });
    }

    const body = (await request.json()) as BallEventInput;

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

    // Persist the new ball event
    const newBall = nextState.balls[nextState.balls.length - 1]!;
    await insertBallEvent({
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
    });

    // Update innings cache columns
    const updated = nextState.currentInnings;
    const cachePatch: Parameters<typeof updateInningCache>[1] = {
      runs: updated.runs,
      wickets: updated.wickets,
      ballsBowled: updated.ballsBowled,
      extras: updated.extras,
      status: updated.status,
    };
    if (updated.status === 'completed') {
      cachePatch.completedAt = new Date();
    }
    await updateInningCache(currentInnings.id, cachePatch);

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
    console.error('POST /api/matches/[id]/ball failed', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteParams) {
  const { id: matchId } = await ctx.params;
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to score' }, { status: 401 });
    }

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
    console.error('DELETE /api/matches/[id]/ball failed', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
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