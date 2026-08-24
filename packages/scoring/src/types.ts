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
  | 'dot'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | 'wide'
  | 'no_ball'
  | 'bye'
  | 'leg_bye'
  | 'penalty' // Law 41/42: 5-run fielding penalty (helmet, tampering, unfair play)
  | 'wicket'; // synthetic — always paired with wicketType

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
  runsOffBat: number; // 0..6 — what the batsman hit (EXCLUDES overthrowRuns)
  extraRuns: number; // penalty (wides/no-balls) + byes/leg-byes
  totalRuns: number; // = runsOffBat + overthrowRuns + extraRuns
  isLegalDelivery: boolean; // false for wide/no_ball/penalty

  /**
   * Overthrow runs — physically run after the ball deflects off a fielder
   * and the batting team crosses while the ball is not yet dead.
   *
   * Law 18.6 / 19.8: they add to the innings total but are NOT credited to
   * the batter's individual runs, fours, or sixes, and therefore do NOT
   * inflate strike rates or boundary counts.
   *
   * Separate from runsOffBat so `updateBatting` can exclude them. Zero on
   * every ordinary delivery.
   */
  overthrowRuns: number;

  isFreeHit: boolean; // this ball IS a free hit (after a no-ball)

  batsmanId: PlayerId; // striker
  nonStrikerId: PlayerId;
  bowlerId: PlayerId;

  wicketType?: WicketType;
  wicketPlayerId?: PlayerId; // who got out (could be either batsman for run-out)
  fielderId?: PlayerId; // who took the catch / threw for run-out

  /**
   * This delivery changed the bowler part-way through an over, deliberately.
   *
   * Law 17.4 forbids it except when a bowler cannot continue — injury, or
   * being suspended from bowling — so it is refused unless the scorer says
   * this is one of those. **Persisted**, and that is the point: replay
   * re-validates every stored delivery, so an override that lived only in the
   * request would make the innings that used it un-replayable.
   */
  bowlerReplacedMidOver?: boolean;

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

  /**
   * This innings' own length in overs, where it differs from the match's.
   *
   * A Super Over is one over inside a twenty-over match, so the match figure
   * is the wrong number to end it on. Undefined means "same as the match",
   * which is every ordinary innings.
   */
  oversPerInnings?: number;

  /**
   * How many overs any one bowler may bowl in this innings.
   *
   * A **playing condition, not a Law** — which is why it is a number carried
   * by the innings rather than a constant in `rules.ts`. Competitions differ,
   * and gully cricket with four players to a side ignores it entirely.
   *
   * Undefined means unenforced, and that is the safe default: a quota the
   * squad cannot cover between them would deadlock an innings with no bowler
   * left who is allowed to bowl. The caller that knows the squad decides —
   * see `createMatchWithFirstInnings` in apps/web/lib/services/matches.ts.
   */
  maxOversPerBowler?: number;
};

/**
 * A stored delivery that the current rules would refuse.
 *
 * Only ever produced while replaying. A delivery being recorded now is
 * rejected outright — that is the whole point of validation — but one already
 * committed to the ball log cannot be un-bowled by tightening a rule, and a
 * scorecard that throws is worse than one that says which ball is wrong.
 */
export type BallViolation = {
  ballId: string;
  ballNumber: number;
  code: ScoringErrorCode;
  message: string;
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

  /**
   * Stored deliveries the current rules would refuse. Empty for any innings
   * scored under the rules as they now stand, which is the normal case.
   *
   * Populated only in replay mode — see `applyBall`. Somewhere to put the
   * answer matters because the alternative is throwing, and throwing on read
   * takes a public scorecard down over a ball bowled months ago.
   */
  violations: BallViolation[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Input type for applyBall — what the scorer UI constructs.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal input for applyBall. The engine will auto-fill:
 *   - `id` (random UUID)
 *   - `overNumber` (computed from innings state)
 *   - `ballNumber` (computed as balls.length + 1)
 *   - `totalRuns` (runsOffBat + overthrowRuns + extraRuns)
 *   - `isLegalDelivery` (derived from eventType)
 *   - `isFreeHit` (taken from state.isFreeHitNext)
 *   - `overthrowRuns` (defaults to 0)
 */
export type BallEventInput = {
  inningsId: InningsId;

  eventType: BallEventType;
  runsOffBat: number;
  extraRuns: number;
  /** Runs that crossed after a deflection — not credited to the batter. Defaults to 0. */
  overthrowRuns?: number;
  totalRuns?: number; // auto-computed if not provided
  isLegalDelivery?: boolean; // auto-derived from eventType if not provided
  isFreeHit?: boolean; // auto-taken from state.isFreeHitNext if not provided

  batsmanId: PlayerId;
  nonStrikerId: PlayerId;
  bowlerId: PlayerId;

  wicketType?: WicketType;
  wicketPlayerId?: PlayerId;
  fielderId?: PlayerId;

  /** See BallEvent.bowlerReplacedMidOver — Law 17.4's injury escape hatch. */
  bowlerReplacedMidOver?: boolean;

  commentary?: string;
  id?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export type ScoringErrorCode =
  | 'INVALID_FREE_HIT_WICKET'
  /** Law 21 / Law 22.6 — that dismissal is not available off that delivery. */
  | 'INVALID_WICKET_FOR_DELIVERY'
  | 'BOWLER_BOWLED_CONSECUTIVE_OVERS'
  | 'BOWLER_BOWLED_PART_OF_PREVIOUS_OVER'
  /** A playing condition, not a Law — only checked when the match sets one. */
  | 'BOWLER_QUOTA_EXCEEDED'
  /** Law 17.4 — the bowler may not change part-way through an over. */
  | 'BOWLER_CHANGED_MID_OVER'
  | 'INNINGS_ALREADY_COMPLETED'
  | 'INNINGS_NOT_IN_PROGRESS'
  | 'BATSMAN_NOT_ON_FIELD'
  /** The dismissed player was not one of the two batters at the crease. */
  | 'WICKET_PLAYER_NOT_AT_CREASE'
  /** Somebody already out was sent back in to bat. */
  | 'BATSMAN_ALREADY_DISMISSED'
  | 'BATSMAN_NOT_REPLACED'
  /** A batter cannot bowl to themselves, or field their own dismissal. */
  | 'PLAYER_IN_TWO_ROLES'
  | 'NEGATIVE_RUNS'
  | 'INVALID_RUNS_OFF_BAT'
  | 'EXTRA_RUNS_WITHOUT_EXTRA_TYPE'
  | 'WICKET_TYPE_MISSING'
  /** Renamed from RUN_OUT_NEEDS_BATSMAN, which described neither the check
   *  it guards (a missing fielder) nor the dismissals it covers (four of
   *  them, only one of which is a run out). */
  | 'WICKET_NEEDS_FIELDER'
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
