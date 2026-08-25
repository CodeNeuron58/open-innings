/**
 * The three players an innings opens with, and the one rule about them.
 *
 * Three screens ask this question — match creation, the innings break, and the
 * Super Over sheet on the result screen — and each had grown its own answer:
 *
 *   `InningsBreak.begin()` checked all three were named and that the batters
 *   differed, then wrote its own two error strings.
 *
 *   `OpenersSheet` never checked anything. It filtered the striker out of the
 *   non-striker's list, so the pair could not collide, and read `ready` as
 *   "all three are non-null".
 *
 *   `new.tsx` disabled its button on `!strikerId || !nonStrikerId || !bowlerId`
 *   and left the pair rule to `createMatchSchema`, which refuses it with a
 *   message nobody sees until the request comes back.
 *
 * Three shapes of the same rule is three chances for one of them to be wrong,
 * and the one that is wrong is the one nobody uses often. So the rule is here,
 * once, and it is the thing the tests point at.
 */

export type OpenersDraft = {
  strikerId: string | null;
  nonStrikerId: string | null;
  bowlerId: string | null;
};

export type OpenersCheck = {
  /** True when this can be sent. */
  ready: boolean;
  /**
   * What is wrong, in a sentence for the scorer — or null when nothing is.
   *
   * Deliberately not thrown and not a code. Every caller renders it in the
   * same place, and the only thing they do with it is show it.
   */
  problem: string | null;
};

/**
 * Is this a pair and a bowler, or not yet?
 *
 * The two failures are separate on purpose. "Nothing is chosen" and "the same
 * person is at both ends" are different mistakes, and a scorer who has just
 * tapped the same name twice should be told which one they made rather than
 * being handed a generic refusal.
 */
export function checkOpeners(draft: OpenersDraft): OpenersCheck {
  const { strikerId, nonStrikerId, bowlerId } = draft;

  if (!strikerId || !nonStrikerId || !bowlerId) {
    return { ready: false, problem: 'Pick both opening batters and the opening bowler.' };
  }

  // The server refuses this too — `openersSchema` has the same refinement —
  // but a request that comes back rejected is a worse way to learn it than a
  // line under the button.
  if (strikerId === nonStrikerId) {
    return { ready: false, problem: 'Striker and non-striker must be different players.' };
  }

  return { ready: true, problem: null };
}

/**
 * The draft as the API wants it, or null when it is not ready.
 *
 * Returning null rather than asserting keeps `checkOpeners` the only place
 * that decides what "ready" means: a caller cannot accidentally build a
 * payload from a draft the check would have refused.
 */
export function openersPayload(draft: OpenersDraft): {
  openingStrikerId: string;
  openingNonStrikerId: string;
  openingBowlerId: string;
} | null {
  if (!checkOpeners(draft).ready) return null;
  return {
    openingStrikerId: draft.strikerId!,
    openingNonStrikerId: draft.nonStrikerId!,
    openingBowlerId: draft.bowlerId!,
  };
}
