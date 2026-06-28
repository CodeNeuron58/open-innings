/**
 * Open Innings — scoring engine.
 *
 * applyBall(state, event) → newState
 *
 * A PURE function. No I/O. No DB. No time. No randomness.
 * The single source of truth lives in `ball_events` (DB); this engine
 * recomputes `MatchState` from those events.
 *
 * ─── Why pure? ──────────────────────────────────────────────────────────────
 *
 *   1. UNDO = "delete the last ball event, recompute from scratch."
 *      No reverse logic. No "rewind". Just replay N-1 events.
 *
 *   2. TESTS = trivial. No mocks. No setup. Just call applyBall and assert.
 *
 *   3. REPLAY = any match can be reconstructed. Stats, scorecards, history.
 *
 * ─── Pipeline ──────────────────────────────────────────────────────────────
 *
 *   For each ball:
 *     1. Validate (free-hit wicket constraints, bowler consecutive overs, …)
 *     2. Update BATTING stats (runs, balls, 4s, 6s, dismissal)
 *     3. Update BOWLING stats (runs conceded, wickets, wides/no-balls, maidens)
 *     4. Update PARTNERSHIP (runs + balls since partnership started)
 *     5. Handle WICKET (record dismissal, end partnership, record fall of wicket)
 *     6. Update INNINGS score (runs, wickets, balls bowled, extras)
 *     7. Handle STRIKE ROTATION (odd runs OR end of over)
 *     8. Handle END OF OVER (record maiden if applicable)
 *     9. Handle END OF INNINGS (all out, overs done, target reached)
 *    10. Update FREE HIT state (next ball is free hit after a no-ball)
 *
 *   Each step is a small pure function. The orchestrator (applyBall) calls
 *   them in order and assembles the result.
 *
 * ─── Batsman replacement after a wicket ─────────────────────────────────────
 *
 *   The engine CANNOT know the new batsman's ID — only the scorer UI does.
 *   After a wicket, the engine keeps strikerId/nonStrikerId as the dismissed
 *   batsman(s). The scorer UI must call `swapBatsman` (lib/scoring/swap.ts)
 *   to update the innings state with the new batsman BEFORE submitting the
 *   next ball event. The validation in applyBall requires batsmanId to
 *   match state.strikerId, so the swap MUST happen first.
 */

import {
  type BallEvent,
  type BallEventInput,
  type MatchState,
  type InningsState,
  type BatsmanStats,
  type BowlerStats,
  type Partnership,
  type FallOfWicket,
  ScoringError,
} from './types';
import {
  BATSMAN_FACING_EXCLUDED_TYPES,
  BOWLER_CREDITED_WICKETS,
  FREE_HIT_VALID_WICKETS,
  NO_CONSECUTIVE_OVERS,
  REQUIRES_FIELDER,
  TEAM_WICKET_COUNTED,
  isLegalDelivery,
} from './rules';
import {
  ballNumberInOver,
  emptyBatsmanStats,
  emptyBowlerStats,
  isEndOfOver as isEndOfOverCheck,
  maxLegalBallsForOvers,
  overNumberFor,
  playerIdKey,
  rotateStrike,
  shouldSwapStrike,
} from './helpers';

// ─────────────────────────────────────────────────────────────────────────────
// applyBall — the main entry point.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a ball event to a match state, returning the new state.
 * Throws ScoringError on invalid events.
 */
export function applyBall(state: MatchState, input: BallEventInput): MatchState {
  const event: BallEvent = normalizeEvent(state, input);
  validate(state, event);
  return compose(state, event);
}

// ─────────────────────────────────────────────────────────────────────────────
// Event normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute derived fields on the input (totalRuns, isLegalDelivery, ballNumber, id).
 * Does NOT modify the input — returns a new event.
 */
function normalizeEvent(state: MatchState, input: BallEventInput): BallEvent {
  const legal = isLegalDelivery(input.eventType);

  // Auto-fill totalRuns if the caller didn't compute it
  const totalRuns = (input.totalRuns ?? input.runsOffBat + input.extraRuns);

  // Auto-fill isLegalDelivery
  const isLegal = input.isLegalDelivery ?? legal;

  // Auto-number the ball within the innings (1-indexed for display)
  const ballNumber = state.balls.length + 1;

  // Auto-fill overNumber from balls bowled so far (only for legal deliveries
  // does it matter; but we always record it for ordering)
  const overNumber = overNumberFor(state.currentInnings.ballsBowled);

  // Free hit on THIS ball: was set at end of last ball if that was a no-ball
  const isFreeHit = input.isFreeHit ?? state.currentInnings.isFreeHitNext;

  return {
    id: input.id ?? cryptoRandomId(),
    inningsId: input.inningsId,
    overNumber,
    ballNumber,
    eventType: input.eventType,
    runsOffBat: input.runsOffBat,
    extraRuns: input.extraRuns,
    totalRuns,
    isLegalDelivery: isLegal,
    isFreeHit,
    batsmanId: input.batsmanId,
    nonStrikerId: input.nonStrikerId,
    bowlerId: input.bowlerId,
    wicketType: input.wicketType,
    wicketPlayerId: input.wicketPlayerId,
    fielderId: input.fielderId,
    commentary: input.commentary,
  };
}

function cryptoRandomId(): string {
  // Browser / Node 18+: globalThis.crypto. We avoid the `crypto` package.
  return globalThis.crypto.randomUUID();
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validate(state: MatchState, event: BallEvent): void {
  const inn = state.currentInnings;

  if (inn.status === 'completed') {
    throw new ScoringError('INNINGS_ALREADY_COMPLETED', 'Innings is already completed');
  }
  if (inn.status === 'not_started') {
    throw new ScoringError('INNINGS_NOT_IN_PROGRESS', 'Innings has not started yet');
  }

  // Negative runs
  if (event.runsOffBat < 0 || event.extraRuns < 0 || event.totalRuns < 0) {
    throw new ScoringError('NEGATIVE_RUNS', 'Runs cannot be negative');
  }

  // Runs off bat must be 0..6
  if (event.runsOffBat < 0 || event.runsOffBat > 6) {
    throw new ScoringError('INVALID_RUNS_OFF_BAT', `runsOffBat must be 0..6, got ${event.runsOffBat}`);
  }

  // Wicket types that require a fielder
  if (event.wicketType && REQUIRES_FIELDER.has(event.wicketType) && !event.fielderId) {
    throw new ScoringError(
      'RUN_OUT_NEEDS_BATSMAN',
      `Wicket type "${event.wicketType}" requires a fielder to be specified`,
    );
  }

  // Wicket type present without wicketPlayerId
  if (event.wicketType && !event.wicketPlayerId) {
    throw new ScoringError('WICKET_TYPE_MISSING', 'wicketPlayerId is required when wicketType is set');
  }

  // Wickets exhausted
  if (inn.wickets >= inn.maxWickets) {
    throw new ScoringError('WICKETS_EXHAUSTED', `All ${inn.maxWickets} wickets have fallen`);
  }

  // Free hit — only run-out can dismiss
  if (event.isFreeHit && event.wicketType && !FREE_HIT_VALID_WICKETS.has(event.wicketType)) {
    throw new ScoringError(
      'INVALID_FREE_HIT_WICKET',
      `On a free hit only run-out can dismiss (got "${event.wicketType}")`,
    );
  }

  // Bowler can't bowl two consecutive overs (Law 16.2).
  // This checks the FIRST ball of a new over (or any ball when the same
  // bowler is bowling again). We compare the bowler on this event with
  // the last bowler of the previous over (lastBowlerId).
  if (
    NO_CONSECUTIVE_OVERS &&
    inn.lastBowlerId !== null &&
    inn.lastBowlerId === event.bowlerId
  ) {
    throw new ScoringError(
      'BOWLER_BOWLED_CONSECUTIVE_OVERS',
      'A bowler may not bowl two consecutive overs (Law 16.2)',
    );
  }

  // batsmanId / nonStrikerId must be the current batsmen
  // RELAXATION: if the previous ball was a wicket, the batsman pair may
  // have been replaced. We trust the scorer UI to send the new batsman
  // IDs (the new striker replaces the dismissed striker; non-striker
  // either stays or is replaced if THEY were dismissed).
  const lastBall = state.balls[state.balls.length - 1];
  const lastBallWasWicket = !!lastBall?.wicketType && !!lastBall?.wicketPlayerId;
  const previousStriker = inn.strikerId;

  // If a wicket occurred on the previous ball and the dismissed player
  // is being replaced (i.e. the event's batsmanId is different from
  // state.strikerId), we accept the new batsman pair.
  const replacingAfterWicket =
    lastBallWasWicket &&
    lastBall.wicketPlayerId !== null &&
    event.batsmanId !== previousStriker;

  if (!replacingAfterWicket) {
    if (
      event.batsmanId !== inn.strikerId ||
      event.nonStrikerId !== inn.nonStrikerId
    ) {
      throw new ScoringError(
        'BATSMAN_NOT_ON_FIELD',
        `Batsmen on event (${playerIdKey(event.batsmanId)}, ${playerIdKey(event.nonStrikerId)}) ` +
          `don't match the current pair (${playerIdKey(inn.strikerId)}, ${playerIdKey(inn.nonStrikerId)})`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Composition — the orchestrator
// ─────────────────────────────────────────────────────────────────────────────

function compose(state: MatchState, event: BallEvent): MatchState {
  const updatedBatting = updateBatting(state, event);
  const updatedBowling = updateBowling(state, event);
  const { partnerships, fallOfWickets } = updatePartnershipAndFall(state, event, updatedBatting);
  const updatedInnings = updateInnings(state, event, fallOfWickets);

  const balls = [...state.balls, event];

  return {
    match: state.match,
    currentInnings: updatedInnings,
    batting: updatedBatting.stats,
    bowling: updatedBowling.stats,
    partnerships,
    fallOfWickets,
    balls,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BATTING updates
// ─────────────────────────────────────────────────────────────────────────────

function updateBatting(
  state: MatchState,
  event: BallEvent,
): { stats: Record<string, BatsmanStats>; strikerOut: BatsmanStats | null } {
  const stats: Record<string, BatsmanStats> = { ...state.batting };
  const strikerKey = playerIdKey(event.batsmanId);
  const nonStrikerKey = playerIdKey(event.nonStrikerId);

  // Ensure both batsmen have entries (could be missing if they came in mid-innings)
  if (!stats[strikerKey]) stats[strikerKey] = emptyBatsmanStats(event.batsmanId);
  if (!stats[nonStrikerKey]) stats[nonStrikerKey] = emptyBatsmanStats(event.nonStrikerId);

  const striker = { ...stats[strikerKey]! };
  const nonStriker = { ...stats[nonStrikerKey]! };

  // Update striker's stats
  // - Wides don't count as balls faced (Law 22.2)
  // - Byes/leg-byes don't count as balls faced (Law 23 + 24)
  // - No-balls DO count as balls faced (Law 21.3 — batsman had a chance to hit)
  if (!BATSMAN_FACING_EXCLUDED_TYPES.has(event.eventType as 'wide')) {
    striker.balls += 1;
  }

  // Runs off the bat — credited to the striker who played the ball
  striker.runs += event.runsOffBat;
  if (event.runsOffBat === 4) striker.fours += 1;
  if (event.runsOffBat === 6) striker.sixes += 1;

  // Wicket on the striker
  let strikerOut: BatsmanStats | null = null;
  if (event.wicketType && event.wicketPlayerId === event.batsmanId) {
    if (striker.isOut) {
      throw new ScoringError('BATSMAN_ALREADY_OUT', 'Batsman is already out');
    }
    if (event.wicketType === 'retired_hurt') {
      striker.isRetiredHurt = true;
      // NOT counted as out for the team — batsman can return
    } else {
      striker.isOut = true;
      striker.dismissalType = event.wicketType;
      striker.fielderId = event.fielderId;
      // Bowler gets credit for credited wicket types
      if (BOWLER_CREDITED_WICKETS.has(event.wicketType)) {
        striker.dismissedByPlayerId = event.bowlerId;
      }
      strikerOut = striker;
    }
  }

  // Wicket on the non-striker (run-out is the common case)
  if (event.wicketType && event.wicketPlayerId === event.nonStrikerId) {
    if (nonStriker.isOut) {
      throw new ScoringError('BATSMAN_ALREADY_OUT', 'Batsman is already out');
    }
    if (event.wicketType !== 'retired_hurt') {
      nonStriker.isOut = true;
      nonStriker.dismissalType = event.wicketType;
      nonStriker.fielderId = event.fielderId;
      // Run-out on non-striker: bowler does NOT get credit
    }
  }

  stats[strikerKey] = striker;
  stats[nonStrikerKey] = nonStriker;

  return { stats, strikerOut };
}

// ─────────────────────────────────────────────────────────────────────────────
// BOWLING updates
// ─────────────────────────────────────────────────────────────────────────────

function updateBowling(
  state: MatchState,
  event: BallEvent,
): { stats: Record<string, BowlerStats>; maidenCheck: boolean } {
  const stats: Record<string, BowlerStats> = { ...state.bowling };
  const bowlerKey = playerIdKey(event.bowlerId);

  if (!stats[bowlerKey]) stats[bowlerKey] = emptyBowlerStats(event.bowlerId);

  const bowler = { ...stats[bowlerKey]! };

  // Runs conceded by the bowler: totalRuns (incl wides/no-balls/penalties)
  bowler.runs += event.totalRuns;

  // Legal ball count
  if (event.isLegalDelivery) {
    bowler.balls += 1;
  }

  // Wicket credit (only certain wicket types)
  if (event.wicketType && event.wicketPlayerId) {
    if (BOWLER_CREDITED_WICKETS.has(event.wicketType)) {
      bowler.wickets += 1;
    }
  }

  // Extras tracking
  if (event.eventType === 'wide') bowler.wides += 1;
  if (event.eventType === 'no_ball') bowler.noBalls += 1;

  stats[bowlerKey] = bowler;

  return { stats, maidenCheck: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTNERSHIP + FALL OF WICKET
// ─────────────────────────────────────────────────────────────────────────────

function updatePartnershipAndFall(
  state: MatchState,
  event: BallEvent,
  _batting: { stats: Record<string, BatsmanStats>; strikerOut: BatsmanStats | null },
): { partnerships: Partnership[]; fallOfWickets: FallOfWicket[] } {
  let partnerships = state.partnerships.map((p) => ({ ...p }));
  const fallOfWickets = [...state.fallOfWickets];

  // Get the active partnership (last one, isActive=true), or start one
  let active = partnerships[partnerships.length - 1];
  if (!active || !active.isActive) {
    active = {
      batsman1Id: event.batsmanId,
      batsman2Id: event.nonStrikerId,
      runs: 0,
      balls: 0,
      isActive: true,
    };
    partnerships.push(active);
  } else {
    partnerships = partnerships.slice(0, -1).concat([active]);
  }

  // Update partnership runs
  const idx = partnerships.length - 1;
  const updated = { ...active };
  updated.runs += event.totalRuns;
  if (event.isLegalDelivery) updated.balls += 1;
  partnerships[idx] = updated;

  // Handle wicket → end partnership
  if (event.wicketType && event.wicketPlayerId) {
    const wicketsSoFar = state.currentInnings.wickets + (TEAM_WICKET_COUNTED.has(event.wicketType) ? 1 : 0);

    if (TEAM_WICKET_COUNTED.has(event.wicketType)) {
      const newRuns = state.currentInnings.runs + event.totalRuns;
      fallOfWickets.push({
        wicketNumber: wicketsSoFar,
        runs: newRuns,
        ballsBowled: state.currentInnings.ballsBowled + (event.isLegalDelivery ? 1 : 0),
        batsmanOutId: event.wicketPlayerId,
        overNumber: event.overNumber,
        ballNumber: ballNumberInOver(state.currentInnings.ballsBowled),
      });

      partnerships[idx] = { ...updated, isActive: false };
    }
  }

  return { partnerships, fallOfWickets };
}

// ─────────────────────────────────────────────────────────────────────────────
// INNINGS updates
// ─────────────────────────────────────────────────────────────────────────────

function updateInnings(
  state: MatchState,
  event: BallEvent,
  _fallOfWickets: FallOfWicket[],
): InningsState {
  const inn = state.currentInnings;

  // Score update
  const runs = inn.runs + event.totalRuns;
  const ballsBowled = inn.ballsBowled + (event.isLegalDelivery ? 1 : 0);
  const extras = inn.extras + event.extraRuns;

  // Wicket update — only counted types
  let wickets = inn.wickets;
  if (event.wicketType && TEAM_WICKET_COUNTED.has(event.wicketType)) {
    wickets += 1;
  }

  // Free hit — this ball IS a free hit, AND this ball (if a no-ball) makes
  // the NEXT ball a free hit
  const isFreeHitNext = event.eventType === 'no_ball';

  // Strike rotation
  // isEndOfOver must be computed against the innings state BEFORE this ball
  // increments the legal-ball counter (otherwise the 6th ball misfires).
  const isEOOver = isEndOfOverCheck(inn, event.isLegalDelivery);
  const shouldSwap = shouldSwapStrike({
    eventType: event.eventType,
    runsOffBat: event.runsOffBat,
    totalRuns: event.totalRuns,
    isEndOfOver: isEOOver,
  });
  const { strikerId: rotatedStriker, nonStrikerId: rotatedNonStriker } = rotateStrike(
    inn.strikerId,
    inn.nonStrikerId,
    shouldSwap,
  );

  // If the previous ball was a wicket and the scorer sent a replacement
  // batsman, accept it: the new batsman replaces the dismissed player.
  // - If the striker was dismissed, the new batsman takes the striker
  //   slot (rotatedStriker is the new batsman).
  // - If the non-striker was dismissed, the new batsman takes the
  //   non-striker slot.
  let strikerId = rotatedStriker;
  let nonStrikerId = rotatedNonStriker;
  const prevBall = state.balls[state.balls.length - 1];
  if (
    prevBall?.wicketType &&
    prevBall.wicketPlayerId &&
    event.batsmanId !== rotatedStriker
  ) {
    // Scorer is bringing in a new batsman. Determine which slot.
    if (prevBall.wicketPlayerId === rotatedStriker) {
      // Striker was out → new batsman takes striker slot
      strikerId = event.batsmanId;
      nonStrikerId = event.nonStrikerId;
    } else if (prevBall.wicketPlayerId === rotatedNonStriker) {
      // Non-striker was out → new batsman takes non-striker slot
      nonStrikerId = event.nonStrikerId;
    }
  }

  // Bowler change at end of over:
  // - `lastBowlerId` tracks the bowler of the PREVIOUS over (null if no
  //   previous over). The validation check uses this to block the same
  //   bowler bowling two overs in a row (Law 16.2).
  // - We only set it when an over JUST ended on this ball. Otherwise
  //   we preserve the previous value.
  // - `currentBowlerId` is taken from the event's bowler — the scorer
  //   signals a bowler change by sending a different bowlerId on the
  //   first ball of the new over.
  const lastBowlerId = isEOOver ? inn.currentBowlerId : inn.lastBowlerId;
  const currentBowlerId = event.bowlerId;

  // Status — did this ball end the innings?
  const maxBalls = maxLegalBallsForOvers(state.match.oversPerInnings);
  const isAllOut = wickets >= inn.maxWickets;
  const oversDone = ballsBowled >= maxBalls;
  const targetReached =
    inn.target !== undefined && runs >= inn.target;

  let status: InningsState['status'] = inn.status;
  if (isAllOut || oversDone || targetReached) {
    status = 'completed';
  }

  return {
    ...inn,
    runs,
    wickets,
    ballsBowled,
    extras,
    strikerId,
    nonStrikerId,
    currentBowlerId,
    lastBowlerId,
    isFreeHitNext,
    status,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public helpers (re-exported)
// ─────────────────────────────────────────────────────────────────────────────

export { maxLegalBallsForOvers } from './helpers';
export { ScoringError } from './types';