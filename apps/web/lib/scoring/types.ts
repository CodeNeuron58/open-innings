/**
 * Open Innings — scoring engine types.
 *
 * The scoring engine is a pure function: applyBall(state, event) → newState.
 * This file defines the shape of state and events. Nothing here has side effects.
 *
 * Key design choice: BallEvent is the source of truth (stored in DB).
 * MatchState is ALWAYS derived — never persisted. recomputeState() replays
 * events to reconstruct it.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Branded ID types — make IDs non-interchangeable at the type level.
// ─────────────────────────────────────────────────────────────────────────────

declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

export type MatchId = Brand<string, 'MatchId'>;
export type InningsId = Brand<string, 'InningsId'>;
export type PlayerId = Brand<string, 'PlayerId'>;
export type TeamId = Brand<string, 'TeamId'>;

export const asMatchId = (s: string): MatchId => s as MatchId;
export const asInningsId = (s: string): InningsId => s as InningsId;
export const asPlayerId = (s: string): PlayerId => s as PlayerId;
export const asTeamId = (s: string): TeamId => s as TeamId;

// ─────────────────────────────────────────────────────────────────────────────
// Cricket enums (mirror the DB schema — keep them in sync!)
// ─────────────────────────────────────────────────────────────────────────────

export type BallEventType =
  'dot' | '1' | '2' | '3' | '4' | '6' | 'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'wicket'; // synthetic — always paired with wicketType

export type WicketType =
  | 'bowled'
  | 'caught'
  | 'caught_behind'
  | 'lbw'
  | 'run_out'
  | 'stumped'
  | 'hit_wicket'
  | 'handled_ball'
  | 'obstructing_field'
  | 'timed_out'
  | 'retired_hurt'
  | 'retired_out'
  | 'double_hit'
  | 'hit_the_ball_twice';

export type MatchStatus = 'scheduled' | 'live' | 'completed' | 'abandoned';
export type InningsStatus = 'not_started' | 'in_progress' | 'completed';

// ─────────────────────────────────────────────────────────────────────────────
// BallEvent — what the scorer records. Persisted to DB as-is.
// ─────────────────────────────────────────────────────────────────────────────

export type BallEvent = {
  id: string;
  inningsId: InningsId;
  overNumber: number; // 0-indexed (0 = first over)
  ballNumber: number; // sequence within innings (1-indexed for display)

  eventType: BallEventType;
  runsOffBat: number; // 0..6 — what the batsman hit
  extraRuns: number; // penalty (wides/no-balls) + byes/leg-byes
  totalRuns: number; // = runsOffBat + extraRuns
  isLegalDelivery: boolean; // false for wide/no_ball

  isFreeHit: boolean; // this ball IS a free hit (after a no-ball)

  batsmanId: PlayerId; // striker
  nonStrikerId: PlayerId;
  bowlerId: PlayerId;

  wicketType?: WicketType;
  wicketPlayerId?: PlayerId; // who got out (could be either batsman for run-out)
  fielderId?: PlayerId; // who took the catch / threw for run-out

  commentary?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-player stats — recomputed by applyBall for every ball.
// ─────────────────────────────────────────────────────────────────────────────

export type BatsmanStats = {
  playerId: PlayerId;
  runs: number;
  balls: number; // legal balls faced (does not include wides)
  fours: number;
  sixes: number;
  isOut: boolean;
  isRetiredHurt?: boolean; // can return later
  dismissalType?: WicketType;
  dismissedByPlayerId?: PlayerId; // bowler who got the wicket (if credited)
  fielderId?: PlayerId;
};

export type BowlerStats = {
  playerId: PlayerId;
  balls: number; // legal balls bowled
  runs: number; // total runs conceded (incl wides/no-balls)
  wickets: number; // EXCLUDES run-outs, handled_ball, obstructing_field, retired_out, timed_out
  maidens: number;
  noBalls: number;
  wides: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Match flow data
// ─────────────────────────────────────────────────────────────────────────────

export type Partnership = {
  batsman1Id: PlayerId; // striker at start
  batsman2Id: PlayerId; // non-striker at start
  runs: number;
  balls: number; // legal balls during partnership
  isActive: boolean;
};

export type FallOfWicket = {
  wicketNumber: number; // 1..10
  runs: number; // team score when wicket fell
  ballsBowled: number; // legal balls bowled when wicket fell
  batsmanOutId: PlayerId;
  overNumber: number;
  ballNumber: number; // within the over (1..6)
};

export type InningsState = {
  id: InningsId;
  inningsNumber: 1 | 2 | 3 | 4;
  battingTeamId: TeamId;
  bowlingTeamId: TeamId;

  // Cached score (also derivable)
  runs: number;
  wickets: number;
  ballsBowled: number; // LEGAL balls only
  extras: number; // total extras (wides + no-balls + byes + leg-byes)

  // Current players
  strikerId: PlayerId;
  nonStrikerId: PlayerId;
  currentBowlerId: PlayerId;
  lastBowlerId?: PlayerId; // for end-of-over logic + consecutive-over check

  // State flags
  isFreeHitNext: boolean; // true if NEXT ball will be a free hit (because last was no-ball)
  status: InningsStatus;
  target?: number; // 2nd innings only — first innings runs + 1

  // For Super Over: cap wickets at 2 instead of 10
  maxWickets: number;
};

export type MatchState = {
  match: {
    id: MatchId;
    oversPerInnings: number;
    status: MatchStatus;
    teamAId: TeamId;
    teamBId: TeamId;
  };
  currentInnings: InningsState;

  batting: Record<string, BatsmanStats>; // keyed by PlayerId
  bowling: Record<string, BowlerStats>; // keyed by PlayerId
  partnerships: Partnership[]; // active is last
  fallOfWickets: FallOfWicket[];

  balls: BallEvent[]; // all balls bowled in this innings, in order
};

// ─────────────────────────────────────────────────────────────────────────────
// Input type for applyBall — what the scorer UI constructs.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal input for applyBall. The engine will auto-fill:
 *   - `id` (random UUID)
 *   - `overNumber` (computed from innings state)
 *   - `ballNumber` (computed as balls.length + 1)
 *   - `totalRuns` (runsOffBat + extraRuns)
 *   - `isLegalDelivery` (derived from eventType)
 *   - `isFreeHit` (taken from state.isFreeHitNext)
 */
export type BallEventInput = {
  inningsId: InningsId;

  eventType: BallEventType;
  runsOffBat: number;
  extraRuns: number;
  totalRuns?: number; // auto-computed if not provided
  isLegalDelivery?: boolean; // auto-derived from eventType if not provided
  isFreeHit?: boolean; // auto-taken from state.isFreeHitNext if not provided

  batsmanId: PlayerId;
  nonStrikerId: PlayerId;
  bowlerId: PlayerId;

  wicketType?: WicketType;
  wicketPlayerId?: PlayerId;
  fielderId?: PlayerId;

  commentary?: string;
  id?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export type ScoringErrorCode =
  | 'INVALID_FREE_HIT_WICKET'
  | 'BOWLER_BOWLED_CONSECUTIVE_OVERS'
  | 'INNINGS_ALREADY_COMPLETED'
  | 'INNINGS_NOT_IN_PROGRESS'
  | 'BATSMAN_NOT_ON_FIELD'
  | 'NEGATIVE_RUNS'
  | 'INVALID_RUNS_OFF_BAT'
  | 'EXTRA_RUNS_WITHOUT_EXTRA_TYPE'
  | 'WICKET_TYPE_MISSING'
  | 'RUN_OUT_NEEDS_BATSMAN'
  | 'BATSMAN_ALREADY_OUT'
  | 'WICKETS_EXHAUSTED';

export class ScoringError extends Error {
  constructor(
    public readonly code: ScoringErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ScoringError';
  }
}
