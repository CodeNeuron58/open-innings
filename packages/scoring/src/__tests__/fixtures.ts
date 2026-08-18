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

  const ballsBowledBefore = overrides.ballsBowledBefore ?? 0;
  const ballsBowledAfter = ballsBowledBefore + (isLegal ? 1 : 0);
  const isEndOfOver = isLegal && ballsBowledAfter % 6 === 0;

  /*
   * Rotation, restated from the Laws — deliberately NOT `shouldSwapStrike`.
   *
   * Importing the engine's own function would be the DRY move and it is the
   * wrong one here. A fixture that calls the function under test agrees with
   * it by construction, so every example test downstream stops being able to
   * see a rotation bug at all. That was measured, not assumed: with the shared
   * import in place, reintroducing the original defect left all 58 example
   * tests green.
   *
   * So this is an independent oracle. It restates two laws and nothing else:
   *
   *   - a penalty run is awarded, not run, so it cannot turn the strike over
   *     (Laws 21.3 and 22.2);
   *   - a change of ends composes with the crossing rather than overriding it,
   *     which is why a single off the last ball keeps the strike (Law 17).
   *
   * If this and the engine ever disagree, one of them is wrong and a test will
   * say so. That is the entire point of keeping them apart.
   */
  const penalty = overrides.eventType === 'wide' || overrides.eventType === 'no_ball' ? 1 : 0;
  const isExtra =
    penalty === 1 || overrides.eventType === 'bye' || overrides.eventType === 'leg_bye';
  const runsRun = isExtra ? overrides.totalRuns - penalty : overrides.runsOffBat;
  const swapsStrike = (runsRun % 2 === 1) !== isEndOfOver;

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
    /*
     * A replacement takes the departing batter's END, and rotation happens
     * first.
     *
     * This used to read "if the striker is out, the non-striker becomes the
     * striker and the new batter comes in at the other end" — which is not
     * cricket. A batter bowled mid-over is replaced *on strike*, because the
     * new batter walks to the end the wicket fell at; the not-out batter does
     * not change ends because a wicket fell.
     *
     * Getting that backwards is why the engine's own batter-identity check
     * could never be tightened: the fixture sent a pair with BOTH slots
     * changed on every dismissal, so the only validation that would accept it
     * was one that accepted anything.
     *
     * The two steps compose, and the order matters. Runs can be completed on
     * the ball that gets someone out — a run out going for the second — so the
     * crossing is applied first and the vacancy is filled wherever the
     * departing batter ended up.
     */
    if (swapsStrike) {
      nextStriker = rot.nonStriker;
      nextNonStriker = rot.striker;
    }
    if (isEndOfOver) nextLastBowler = rot.bowler;

    const replacement = `p_new_${rot.nextNewBatsmanIdx}`;
    if (overrides.wicketPlayerId === nextStriker) nextStriker = replacement;
    else if (overrides.wicketPlayerId === nextNonStriker) nextNonStriker = replacement;

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

  if (swapsStrike) {
    nextStriker = rot.nonStriker;
    nextNonStriker = rot.striker;
  }

  if (isEndOfOver) {
    // The next ball needs a different bowler (Law 17.6). Recorded here so the
    // caller knows, but the bowler is NOT auto-changed — tests set it.
    nextLastBowler = rot.bowler;
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
