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
  BALLS_PER_OVER,
  BATSMAN_FACING_EXCLUDED_TYPES,
  BATTER_LEAVES_FIELD,
  BOWLER_CREDITED_WICKETS,
  BOWLER_EXEMPT_EXTRAS,
  FREE_HIT_VALID_WICKETS,
  NON_DELIVERY_WICKETS,
  NO_BALL_VALID_WICKETS,
  NO_CONSECUTIVE_OVERS,
  REQUIRES_FIELDER,
  TEAM_WICKET_COUNTED,
  WIDE_VALID_WICKETS,
  isLegalDelivery,
} from './rules';
import {
  ballNumberInOver,
  emptyBatsmanStats,
  emptyBowlerStats,
  isEndOfOver as isEndOfOverCheck,
  isMaidenOver,
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
  const totalRuns = input.totalRuns ?? input.runsOffBat + input.extraRuns;

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
    // Carried through rather than dropped: replay re-validates every stored
    // delivery, so an over that lawfully changed bowler mid-way would stop
    // replaying the moment this was lost.
    bowlerReplacedMidOver: input.bowlerReplacedMidOver,
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
    throw new ScoringError(
      'INVALID_RUNS_OFF_BAT',
      `runsOffBat must be 0..6, got ${event.runsOffBat}`,
    );
  }

  // Wicket types that require a fielder
  if (event.wicketType && REQUIRES_FIELDER.has(event.wicketType) && !event.fielderId) {
    throw new ScoringError(
      'WICKET_NEEDS_FIELDER',
      `Wicket type "${event.wicketType}" requires a fielder to be specified`,
    );
  }

  // Wicket type present without wicketPlayerId
  if (event.wicketType && !event.wicketPlayerId) {
    throw new ScoringError(
      'WICKET_TYPE_MISSING',
      'wicketPlayerId is required when wicketType is set',
    );
  }

  // Wickets exhausted
  if (inn.wickets >= inn.maxWickets) {
    throw new ScoringError('WICKETS_EXHAUSTED', `All ${inn.maxWickets} wickets have fallen`);
  }

  validateDismissedPlayer(state, event);
  validateDismissalLegality(event);
  validateRoles(event);
  validateBowler(state, event);
  validateBatters(state, event);
}

/**
 * The player who got out was one of the two who were batting.
 *
 * Nothing checked this. `updateBatting` only marks a dismissal when
 * `wicketPlayerId` matches the striker or the non-striker, but `updateInnings`
 * counts the wicket regardless — so a mistyped id took a wicket off the
 * batting side while leaving both batters not out, and pushed a fall-of-wicket
 * for somebody who never came in. The innings could then end with batters
 * still at the crease, and every derived figure inherited it silently.
 */
function validateDismissedPlayer(state: MatchState, event: BallEvent): void {
  if (!event.wicketPlayerId) return;

  const inn = state.currentInnings;
  if (event.wicketPlayerId === event.batsmanId || event.wicketPlayerId === event.nonStrikerId) {
    return;
  }

  throw new ScoringError(
    'WICKET_PLAYER_NOT_AT_CREASE',
    `${playerIdKey(event.wicketPlayerId)} is not batting — the pair at the crease is ` +
      `(${playerIdKey(inn.strikerId)}, ${playerIdKey(inn.nonStrikerId)})`,
  );
}

/**
 * Which dismissals this delivery could possibly have produced.
 *
 * Three independent rules, applied in sequence so a delivery governed by more
 * than one — a free hit that was called wide — is held to all of them, and the
 * intersection falls out without anyone having to write it down.
 *
 * Retirements and Timed out are skipped: they are not outcomes of the ball
 * they are recorded against. See NON_DELIVERY_WICKETS.
 */
function validateDismissalLegality(event: BallEvent): void {
  const wicket = event.wicketType;
  if (!wicket || NON_DELIVERY_WICKETS.has(wicket)) return;

  // Law 22.6 — a wide is not a hittable ball, so Bowled, Caught and LBW are
  // impossible off one. Stumped is the common case.
  if (event.eventType === 'wide' && !WIDE_VALID_WICKETS.has(wicket)) {
    throw new ScoringError(
      'INVALID_WICKET_FOR_DELIVERY',
      `A batter cannot be out "${wicket}" off a wide (Law 22.6)`,
    );
  }

  // Law 21 — off a no ball only a run out, obstructing the field, or hitting
  // the ball twice is available.
  if (event.eventType === 'no_ball' && !NO_BALL_VALID_WICKETS.has(wicket)) {
    throw new ScoringError(
      'INVALID_WICKET_FOR_DELIVERY',
      `A batter cannot be out "${wicket}" off a no ball (Law 21)`,
    );
  }

  // Law 21.18 — a free hit carries a no ball's dismissals, whatever the
  // delivery itself turned out to be.
  if (event.isFreeHit && !FREE_HIT_VALID_WICKETS.has(wicket)) {
    throw new ScoringError(
      'INVALID_FREE_HIT_WICKET',
      `A batter cannot be out "${wicket}" on a free hit (Law 21.18)`,
    );
  }
}

/**
 * Nobody is in two places at once.
 *
 * The engine holds no squads, so it cannot check that a fielder belongs to the
 * fielding side — that belongs where the squads are loaded. What it can check
 * needs no squad at all: the two batters at the crease are not also bowling,
 * and are not fielding their own dismissal. Both were accepted before this,
 * and both put one player on the scorecard twice for a single delivery.
 */
function validateRoles(event: BallEvent): void {
  if (event.bowlerId === event.batsmanId || event.bowlerId === event.nonStrikerId) {
    throw new ScoringError(
      'PLAYER_IN_TWO_ROLES',
      `${playerIdKey(event.bowlerId)} is batting and cannot also be bowling`,
    );
  }

  if (
    event.fielderId &&
    (event.fielderId === event.batsmanId || event.fielderId === event.nonStrikerId)
  ) {
    throw new ScoringError(
      'PLAYER_IN_TWO_ROLES',
      `${playerIdKey(event.fielderId)} is batting and cannot also be fielding`,
    );
  }
}

/** Law 16.2, Law 17.4, and the competition's over quota if it set one. */
function validateBowler(state: MatchState, event: BallEvent): void {
  const inn = state.currentInnings;

  // Law 16.2 — a bowler may not bowl two consecutive overs. `lastBowlerId`
  // holds the bowler of the PREVIOUS over and is only written when an over
  // closes, so this compares against the right person on every ball of the
  // current one. (`!= null` covers undefined too. It read `!== null` on an
  // optional field, so that half of the guard could never fire.)
  if (NO_CONSECUTIVE_OVERS && inn.lastBowlerId != null && inn.lastBowlerId === event.bowlerId) {
    throw new ScoringError(
      'BOWLER_BOWLED_CONSECUTIVE_OVERS',
      'A bowler may not bowl two consecutive overs (Law 16.2)',
    );
  }

  // Law 17.4 — the bowler is named for the over and may not be swapped
  // part-way through it, except for injury or suspension. "Part-way" means a
  // delivery has already been bowled in this over, which is not the same test
  // as `ballsBowled % 6 !== 0`: a wide as the first delivery starts the over
  // without advancing that counter.
  const currentOver = overNumberFor(inn.ballsBowled);
  const overInProgress = state.balls.some((b) => b.overNumber === currentOver);
  if (overInProgress && event.bowlerId !== inn.currentBowlerId && !event.bowlerReplacedMidOver) {
    throw new ScoringError(
      'BOWLER_CHANGED_MID_OVER',
      'The bowler may not change part-way through an over (Law 17.4). ' +
        'Set bowlerReplacedMidOver if they cannot continue.',
    );
  }

  // The competition's quota, where the match named one. Counted in legal
  // balls, so a bowler part-way through their last over may finish it and a
  // wide does not spend the allowance.
  if (inn.maxOversPerBowler !== undefined) {
    const bowled = state.bowling[playerIdKey(event.bowlerId)]?.balls ?? 0;
    if (bowled >= inn.maxOversPerBowler * BALLS_PER_OVER) {
      throw new ScoringError(
        'BOWLER_QUOTA_EXCEEDED',
        `${playerIdKey(event.bowlerId)} has already bowled their ${inn.maxOversPerBowler} overs`,
      );
    }
  }
}

/**
 * The pair on the event is the pair at the crease — or a lawful replacement
 * for one of them.
 *
 * The engine leaves a dismissed batter in their slot until the next delivery
 * names who came in, so a changed pair is how a replacement is communicated.
 * That relaxation used to accept *any* pair after any wicket, which let both
 * batters be swapped at once, let one batter stand at both ends, and let
 * somebody already dismissed walk back in and carry on scoring.
 *
 * So the relaxation is kept and bounded: exactly one slot may change, it must
 * be the slot the departing batter was standing in, and whoever walks in must
 * not already be out. A retired hurt batter is not out, which is exactly why
 * they may return — and only at the fall of a wicket, which this shape
 * enforces for free.
 */
function validateBatters(state: MatchState, event: BallEvent): void {
  const inn = state.currentInnings;

  if (event.batsmanId === event.nonStrikerId) {
    throw new ScoringError(
      'BATSMAN_NOT_ON_FIELD',
      `${playerIdKey(event.batsmanId)} cannot be at both ends`,
    );
  }

  const strikerChanged = event.batsmanId !== inn.strikerId;
  const nonStrikerChanged = event.nonStrikerId !== inn.nonStrikerId;
  if (!strikerChanged && !nonStrikerChanged) return;

  const mismatch = () =>
    new ScoringError(
      'BATSMAN_NOT_ON_FIELD',
      `Batsmen on event (${playerIdKey(event.batsmanId)}, ${playerIdKey(event.nonStrikerId)}) ` +
        `don't match the current pair (${playerIdKey(inn.strikerId)}, ${playerIdKey(inn.nonStrikerId)})`,
    );

  // Only the previous delivery can have created a vacancy.
  const lastBall = state.balls[state.balls.length - 1];
  const departed =
    lastBall?.wicketType && lastBall.wicketPlayerId && BATTER_LEAVES_FIELD.has(lastBall.wicketType)
      ? lastBall.wicketPlayerId
      : undefined;
  if (departed === undefined) throw mismatch();

  // One vacancy, one replacement.
  if (strikerChanged && nonStrikerChanged) throw mismatch();

  // …and it has to be the vacancy that actually exists. Which slot holds the
  // departing batter depends on whether the strike rotated on the ball that
  // dismissed them, so it is read from state rather than assumed.
  const vacatedSlotHeldDeparted = strikerChanged
    ? inn.strikerId === departed
    : inn.nonStrikerId === departed;
  if (!vacatedSlotHeldDeparted) throw mismatch();

  const incoming = strikerChanged ? event.batsmanId : event.nonStrikerId;
  if (state.batting[playerIdKey(incoming)]?.isOut) {
    throw new ScoringError(
      'BATSMAN_ALREADY_DISMISSED',
      `${playerIdKey(incoming)} is already out and cannot bat again`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Composition — the orchestrator
// ─────────────────────────────────────────────────────────────────────────────

function compose(state: MatchState, event: BallEvent): MatchState {
  // Computed once, against the innings state as it stands BEFORE this ball
  // increments the legal-ball counter, and shared by the two steps that need
  // it: the bowler's maiden and the strike rotation.
  const isEOOver = isEndOfOverCheck(state.currentInnings, event.isLegalDelivery);

  const updatedBatting = updateBatting(state, event);
  const updatedBowling = updateBowling(state, event, isEOOver);
  const { partnerships, fallOfWickets } = updatePartnershipAndFall(state, event, updatedBatting);
  const updatedInnings = updateInnings(state, event, fallOfWickets, isEOOver);

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
  if (!BATSMAN_FACING_EXCLUDED_TYPES.has(event.eventType)) {
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
  isEndOfOver: boolean,
): { stats: Record<string, BowlerStats>; maidenCheck: boolean } {
  const stats: Record<string, BowlerStats> = { ...state.bowling };
  const bowlerKey = playerIdKey(event.bowlerId);

  if (!stats[bowlerKey]) stats[bowlerKey] = emptyBowlerStats(event.bowlerId);

  const bowler = { ...stats[bowlerKey]! };

  // Runs conceded: everything except byes and leg-byes.
  //
  // Law 24 does not charge those to the bowler — a bye beat the keeper and a
  // leg-bye came off the pad, and neither is a fault of the bowling. The wide
  // and no-ball penalties are charged, because those are.
  //
  // This has to agree with `bowlingInningsFor` in apps/web/lib/db/stats.ts,
  // which computes career economy the same way. Charging byes here made a
  // bowler's figures on a match card disagree with their career page for the
  // same over.
  const chargedToBowler = BOWLER_EXEMPT_EXTRAS.has(event.eventType) ? 0 : event.totalRuns;
  bowler.runs += chargedToBowler;

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

  // Maidens, credited when the over closes.
  //
  // This is the step the module docstring has always claimed to perform and
  // never did: `maidens` was initialised to zero and never touched again, so
  // every bowling figure in the app rendered "4-0-22-1" whatever was bowled.
  if (isEndOfOver) {
    const overBalls = [...state.balls, event].filter((b) => b.overNumber === event.overNumber);
    // Only when this bowler bowled the whole over. `validate` blocks a bowler
    // taking two overs in a row but not a change part-way through one, so
    // without this check whoever happened to send down the sixth ball would be
    // credited with a maiden they only partly bowled — "0.3-1-0-0".
    const bowledWholeOver = overBalls.every((b) => b.bowlerId === event.bowlerId);
    if (bowledWholeOver && isMaidenOver(overBalls)) bowler.maidens += 1;
  }

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

  // Handle wicket → record the fall, and end the partnership.
  //
  // Two different questions, and they used to share one answer. A fall of
  // wicket is recorded when the *team* loses a wicket; a partnership ends when
  // a *batter walks off*, which a retired hurt batter does without the team
  // losing anything. Gating both on TEAM_WICKET_COUNTED left a retirement
  // inside the partnership it interrupted, so the stand was credited to a pair
  // who never batted together.
  if (event.wicketType && event.wicketPlayerId) {
    if (TEAM_WICKET_COUNTED.has(event.wicketType)) {
      const wicketsSoFar = state.currentInnings.wickets + 1;
      const newRuns = state.currentInnings.runs + event.totalRuns;
      fallOfWickets.push({
        wicketNumber: wicketsSoFar,
        runs: newRuns,
        ballsBowled: state.currentInnings.ballsBowled + (event.isLegalDelivery ? 1 : 0),
        batsmanOutId: event.wicketPlayerId,
        overNumber: event.overNumber,
        ballNumber: ballNumberInOver(state.currentInnings.ballsBowled),
      });
    }

    if (BATTER_LEAVES_FIELD.has(event.wicketType)) {
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
  isEOOver: boolean,
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

  // Free hit — granted by a no-ball, and NOT consumed by an illegal delivery.
  //
  // Law 21.18 grants it for the next *delivery*, and a wide is re-bowled
  // rather than counted, so a wide between the no-ball and the free hit does
  // not spend it. Previously this read `eventType === 'no_ball'` alone, so a
  // single wide silently cancelled the free hit the batter had earned.
  const isFreeHitNext =
    event.eventType === 'no_ball' || (inn.isFreeHitNext && !event.isLegalDelivery);

  // Strike rotation. `isEOOver` was computed by the caller against the innings
  // state BEFORE this ball incremented the legal-ball counter.
  const shouldSwap = shouldSwapStrike({
    eventType: event.eventType,
    runsOffBat: event.runsOffBat,
    totalRuns: event.totalRuns,
    isEndOfOver: isEOOver,
  });
  // The event declares the pair at the crease when this ball was bowled —
  // validation has already confirmed it is either the current pair or a
  // legal replacement after a wicket. Rotation must apply to the pair that
  // actually faced the ball, so a replacement is swapped in BEFORE rotating
  // (rotating first and patching after scrambles ends when the new batter
  // takes an odd run on their first ball).
  const { strikerId, nonStrikerId } = rotateStrike(event.batsmanId, event.nonStrikerId, shouldSwap);

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
  //
  // The innings carries its own length where it differs from the match's. A
  // Super Over is one over inside a twenty-over game, and reading the match
  // figure meant innings 3 and 4 ran on for the full twenty.
  const maxBalls = maxLegalBallsForOvers(inn.oversPerInnings ?? state.match.oversPerInnings);
  const isAllOut = wickets >= inn.maxWickets;
  const oversDone = ballsBowled >= maxBalls;
  const targetReached = inn.target !== undefined && runs >= inn.target;

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
