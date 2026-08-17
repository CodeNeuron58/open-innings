/**
 * Open Innings — small pure helpers used by the scoring engine.
 *
 * Every function here is pure (no side effects, no I/O). They form the
 * building blocks of applyBall().
 */

import type { BowlerStats, BatsmanStats, InningsState } from './types';
import { asPlayerId, type PlayerId } from './types';
import { BALLS_PER_OVER, NO_BALL_PENALTY, WIDE_PENALTY } from './rules';

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
 * How many runs the batters actually ran.
 *
 * The distinction that matters for the strike: a penalty run is *awarded*, not
 * run. Nobody crosses for it. A plain wide is one run on the board with both
 * batters standing exactly where they were.
 */
function runsCrossed(args: { eventType: string; runsOffBat: number; totalRuns: number }): number {
  switch (args.eventType) {
    case 'wide':
      // Law 22.2: one penalty; anything beyond it was run, or went to the fence.
      return Math.max(0, args.totalRuns - WIDE_PENALTY);
    case 'no_ball':
      // Law 21.3: likewise. What remains was struck, or taken as byes off it.
      return Math.max(0, args.totalRuns - NO_BALL_PENALTY);
    case 'bye':
    case 'leg_bye':
      // No penalty attached, so every run on the board was run.
      return args.totalRuns;
    default:
      return args.runsOffBat;
  }
}

/**
 * Should the strike swap after this ball?
 *
 * Two independent things can change the striker and they **compose** rather
 * than override:
 *
 *   1. The batters cross for an odd number of runs.
 *   2. The over ends, and the next one is bowled from the other end.
 *
 * Both true is a swap and a swap back — which is precisely why a single off
 * the last ball of an over *keeps* the strike, and why a tail-ender takes one
 * off the fifth ball rather than the sixth. Treating end-of-over as "always
 * swap" gets that backwards on every over that ends in an odd run.
 */
export function shouldSwapStrike(args: {
  eventType: string;
  runsOffBat: number;
  totalRuns: number;
  isEndOfOver: boolean;
}): boolean {
  const crossed = runsCrossed(args) % 2 === 1;
  // XOR: either one swaps, both cancel.
  return crossed !== args.isEndOfOver;
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
 * Did this over's deliveries make a maiden?
 *
 * A maiden is an over off which no runs were scored **from the bat** and in
 * which the bowler conceded no wide and no no-ball. Byes and leg-byes do not
 * break it: they came off the keeper or the pad, Law 24 does not charge them
 * to the bowler, and a maiden is a statement about the bowling.
 *
 * The previous version tested `totalRuns === 0`, which denied a bowler their
 * maiden the moment a bye slipped through — and the comment above it claimed
 * byes *should* break a maiden, which is not what Law 24 says. Both are fixed
 * here; the figure was never displayed before because nothing called this.
 */
export function isMaidenOver(ballsInOver: { eventType: string; runsOffBat: number }[]): boolean {
  // An over with no deliveries in it is not a maiden, it is nothing.
  if (ballsInOver.length === 0) return false;
  return ballsInOver.every(
    (b) => b.runsOffBat === 0 && b.eventType !== 'wide' && b.eventType !== 'no_ball',
  );
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
