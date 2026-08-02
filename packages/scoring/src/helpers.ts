/**
 * Open Innings — small pure helpers used by the scoring engine.
 *
 * Every function here is pure (no side effects, no I/O). They form the
 * building blocks of applyBall().
 */

import type { BowlerStats, BatsmanStats, InningsState } from './types';
import { asPlayerId, type PlayerId } from './types';
import { BALLS_PER_OVER } from './rules';

// ─────────────────────────────────────────────────────────────────────────────
// Display formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert legal balls bowled to the cricket display format.
 * Example: 12 legal balls = "2.0", 13 legal balls = "2.1", 78 legal balls = "13.0"
 */
export function formatOvers(legalBalls: number): string {
  const completeOvers = Math.floor(legalBalls / BALLS_PER_OVER);
  const ballsInOver = legalBalls % BALLS_PER_OVER;
  return `${completeOvers}.${ballsInOver}`;
}

/**
 * Max legal balls for a given overs limit.
 * Example: oversPerInnings = 20 → 120 legal balls.
 */
export function maxLegalBallsForOvers(oversPerInnings: number): number {
  return oversPerInnings * BALLS_PER_OVER;
}

/**
 * Current run rate (runs per over) given total runs and legal balls bowled.
 */
export function currentRunRate(runs: number, legalBalls: number): number {
  if (legalBalls === 0) return 0;
  return (runs / legalBalls) * BALLS_PER_OVER;
}

/**
 * Required run rate for a chasing team.
 */
export function requiredRunRate(
  target: number,
  currentRuns: number,
  legalBallsBowled: number,
  totalLegalBalls: number,
): number {
  const runsNeeded = target - currentRuns;
  const ballsRemaining = totalLegalBalls - legalBallsBowled;
  if (ballsRemaining <= 0) return runsNeeded > 0 ? Infinity : 0;
  return (runsNeeded / ballsRemaining) * BALLS_PER_OVER;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats factories
// ─────────────────────────────────────────────────────────────────────────────

/** Create an empty batsman stats record for a player coming in to bat. */
export function emptyBatsmanStats(playerId: PlayerId): BatsmanStats {
  return {
    playerId,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    isOut: false,
  };
}

/** Create an empty bowler stats record for a player starting to bowl. */
export function emptyBowlerStats(playerId: PlayerId): BowlerStats {
  return {
    playerId,
    balls: 0,
    runs: 0,
    wickets: 0,
    maidens: 0,
    noBalls: 0,
    wides: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Strike rotation (Law 27)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Should the strike swap after this ball?
 *
 * Rules:
 *   - End of over → always swap
 *   - Odd runs off the bat (1, 3) → swap
 *   - Odd runs in total for byes/leg-byes (where runsOffBat = 0) → swap based on totalRuns
 *   - Wides where batsmen ran → swap based on totalRuns
 *   - Even runs, not end of over → no swap
 *
 * For wides/no-balls: the batsmen CAN run, so swap on odd totalRuns.
 * For byes/leg-byes: no runsOffBat, so use totalRuns.
 */
export function shouldSwapStrike(args: {
  eventType: string;
  runsOffBat: number;
  totalRuns: number;
  isEndOfOver: boolean;
}): boolean {
  if (args.isEndOfOver) return true;

  const isExtra =
    args.eventType === 'wide' ||
    args.eventType === 'no_ball' ||
    args.eventType === 'bye' ||
    args.eventType === 'leg_bye';

  // For extras, swap based on total runs completed
  // For non-extras, swap based on runs off the bat
  const runsForSwap = isExtra ? args.totalRuns : args.runsOffBat;
  return runsForSwap % 2 === 1;
}

/** Compute new striker / non-striker IDs after a ball. */
export function rotateStrike(
  strikerId: PlayerId,
  nonStrikerId: PlayerId,
  shouldSwap: boolean,
): { strikerId: PlayerId; nonStrikerId: PlayerId } {
  if (!shouldSwap) return { strikerId, nonStrikerId };
  return { strikerId: nonStrikerId, nonStrikerId: strikerId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Over completion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Did this legal delivery just complete an over?
 * (A wide / no-ball is illegal, doesn't count toward the over.)
 *
 * @param inningsBeforeLegalIncrement - innings state BEFORE this ball's legal-ball counter increments
 */
export function isEndOfOver(
  inningsBeforeLegalIncrement: InningsState,
  isLegalDelivery: boolean,
): boolean {
  if (!isLegalDelivery) return false;
  // An over completes when this legal ball is the 6th in the over.
  // i.e. BEFORE incrementing, ballsBowled % 6 === 5.
  return inningsBeforeLegalIncrement.ballsBowled % BALLS_PER_OVER === BALLS_PER_OVER - 1;
}

/**
 * Compute the over number this ball belongs to (0-indexed).
 */
export function overNumberFor(legalBallsBowledBefore: number): number {
  return Math.floor(legalBallsBowledBefore / BALLS_PER_OVER);
}

/**
 * Compute the position within the over (1..6) for display.
 */
export function ballNumberInOver(legalBallsBowledBefore: number): number {
  return (legalBallsBowledBefore % BALLS_PER_OVER) + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Maiden over detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute whether a bowler just bowled a maiden over.
 * A maiden is an over where no runs are scored off the bat AND no extras
 * are conceded. Byes and leg-byes DO count against a maiden (Law 12.2.4).
 * Wides and no-balls break the maiden (penalty runs + any off-bat runs).
 *
 * We compute this in the engine at end-of-over time by inspecting the over's
 * balls. See `isMaidenOver` in helpers.
 */
export function isMaidenOver(ballsInOver: { eventType: string; totalRuns: number }[]): boolean {
  return ballsInOver.every((b) => b.totalRuns === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Team-vs-playerId safety
// ─────────────────────────────────────────────────────────────────────────────

/** String-safe PlayerId accessor (for Record lookups). */
export function playerIdKey(playerId: PlayerId): string {
  return playerId as unknown as string;
}

/** Convenience: cast a string ID to PlayerId (use ONLY when you trust the source). */
export const playerId = (s: string): PlayerId => asPlayerId(s);
