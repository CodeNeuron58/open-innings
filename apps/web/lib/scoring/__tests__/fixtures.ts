/**
 * Test fixture: track current striker/non-striker/bowler for sequential tests.
 *
 * The engine is strict: each event's batsmanId/nonStrikerId must match the
 * current pair. After a ball, the pair may swap (odd runs / end of over).
 * After a wicket, the scorer would bring in a new batsman — we simulate
 * that with a stable new-batsman generator.
 *
 * This helper keeps tests readable.
 */

import { type BallEventInput, type BallEventType, type PlayerId, asInningsId } from '../types';

export type Rotation = {
  striker: string;
  nonStriker: string;
  bowler: string;
  lastBowler: string | null;
  /** Index for new batsman generation (cricket has 11 players). */
  nextNewBatsmanIdx: number;
};

export function startRotation(striker: string, nonStriker: string, bowler: string): Rotation {
  return { striker, nonStriker, bowler, lastBowler: null, nextNewBatsmanIdx: 0 };
}

/**
 * Apply a ball to the rotation. Returns the next rotation AND the event
 * with the correct batsmanId/nonStrikerId/bowlerId filled in.
 *
 * NOTE: ballsBowledAfter=0 is a simplification — this helper assumes each
 * ball increments ballsBowled by 0 or 1. For end-of-over detection we
 * track this implicitly via `ballsBowled`. Tests that need to know the
 * exact ball number within the over should pass it in or use applyBall
 * directly with the returned state.
 */
export type PlayOverrides = {
  eventType: BallEventType | string;
  runsOffBat: number;
  totalRuns: number;
  ballsBowledBefore?: number;
  wicketType?: string;
  wicketPlayerId?: string;
  fielderId?: string;
};

export function play(
  rot: Rotation,
  overrides: PlayOverrides,
): { rotation: Rotation; event: BallEventInput; ballsBowledAfter: number } {
  const isLegal = overrides.eventType !== 'wide' && overrides.eventType !== 'no_ball';
  const isWicket = !!overrides.wicketType;
  const isOddBatRuns = overrides.runsOffBat % 2 === 1;
  const isOddTotal =
    overrides.eventType === 'wide' ||
    overrides.eventType === 'no_ball' ||
    overrides.eventType === 'bye' ||
    overrides.eventType === 'leg_bye'
      ? overrides.totalRuns % 2 === 1
      : isOddBatRuns;

  const ballsBowledBefore = overrides.ballsBowledBefore ?? 0;
  const ballsBowledAfter = ballsBowledBefore + (isLegal ? 1 : 0);
  const isEndOfOver = isLegal && (ballsBowledAfter % 6 === 0);

  // Build the event with the current batsmen + bowler
  const event: BallEventInput = {
    inningsId: asInningsId('i1'),
    eventType: overrides.eventType as BallEventType,
    runsOffBat: overrides.runsOffBat,
    extraRuns: overrides.totalRuns - overrides.runsOffBat,
    totalRuns: overrides.totalRuns,
    batsmanId: rot.striker as PlayerId,
    nonStrikerId: rot.nonStriker as PlayerId,
    bowlerId: rot.bowler as PlayerId,
    wicketType: overrides.wicketType as BallEventInput['wicketType'],
    wicketPlayerId: overrides.wicketPlayerId as PlayerId | undefined,
    fielderId: overrides.fielderId as PlayerId | undefined,
  };

  // Compute next rotation
  let nextStriker = rot.striker;
  let nextNonStriker = rot.nonStriker;
  const nextBowler = rot.bowler;
  let nextLastBowler = rot.lastBowler;

  if (isWicket) {
    // Out batsman gets replaced. If the striker is out, the non-striker becomes
    // the striker and a new batsman comes in as non-striker.
    if (overrides.wicketPlayerId === rot.striker || overrides.wicketType === 'run_out') {
      // striker out
      nextStriker = rot.nonStriker;
      nextNonStriker = `p_new_${rot.nextNewBatsmanIdx}`;
    } else if (overrides.wicketPlayerId === rot.nonStriker) {
      // non-striker out — current striker stays, new batsman in
      nextNonStriker = `p_new_${rot.nextNewBatsmanIdx}`;
    }
    return {
      rotation: {
        striker: nextStriker,
        nonStriker: nextNonStriker,
        bowler: nextBowler,
        lastBowler: nextLastBowler,
        nextNewBatsmanIdx: rot.nextNewBatsmanIdx + 1,
      },
      event,
      ballsBowledAfter,
    };
  }

  if (isEndOfOver) {
    // Always swap on end of over
    nextStriker = rot.nonStriker;
    nextNonStriker = rot.striker;
    nextLastBowler = rot.bowler;
    // The next ball will need a new bowler. We mark this via lastBowlerId set,
    // but DON'T auto-change the bowler — tests must explicitly set bowler.
    return {
      rotation: {
        striker: nextStriker,
        nonStriker: nextNonStriker,
        bowler: rot.bowler, // unchanged — caller must change for next over
        lastBowler: nextLastBowler,
        nextNewBatsmanIdx: rot.nextNewBatsmanIdx,
      },
      event,
      ballsBowledAfter,
    };
  }

  if (isOddTotal) {
    nextStriker = rot.nonStriker;
    nextNonStriker = rot.striker;
  }

  return {
    rotation: {
      striker: nextStriker,
      nonStriker: nextNonStriker,
      bowler: nextBowler,
      lastBowler: nextLastBowler,
      nextNewBatsmanIdx: rot.nextNewBatsmanIdx,
    },
    event,
    ballsBowledAfter,
  };
}
