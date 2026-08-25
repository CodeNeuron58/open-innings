/**
 * How an extra splits into the batter's runs and the side's.
 * A no-ball's one-run penalty is the extra, and any additional runs are struck by the batter.
 */
import type { BallEventType } from '@open-innings/scoring';

export type ExtraKind = 'wide' | 'no_ball' | 'bye' | 'leg_bye';

/**
 * Totals a scorer can pick, per extra.
 * Wides/no-balls start at 1 (penalty). No-balls reach 7 (penalty + 6).
 * Byes/leg-byes start at 1 (no penalty).
 */
export const EXTRA_TOTALS: Record<ExtraKind, number[]> = {
  wide: [1, 2, 3, 4, 5, 6],
  no_ball: [1, 2, 3, 4, 5, 6, 7],
  bye: [1, 2, 3, 4, 5, 6],
  leg_bye: [1, 2, 3, 4, 5, 6],
};

export const EXTRA_LABELS: Record<ExtraKind, string> = {
  wide: 'Wide',
  no_ball: 'No ball',
  bye: 'Bye',
  leg_bye: 'Leg bye',
};

/**
 * Split a chosen total into what the batter gets and what the side gets.
 */
export function splitExtra(
  kind: ExtraKind,
  totalRuns: number,
): { runsOffBat: number; extraRuns: number } {
  if (kind === 'no_ball') {
    return { extraRuns: 1, runsOffBat: Math.max(0, totalRuns - 1) };
  }
  return { runsOffBat: 0, extraRuns: totalRuns };
}

/**
 * The delivery a dismissal happened off.
 *
 * `fair` is the ordinary case. The four extras are here because the engine
 * already accepts a dismissal on any of them — `validateWicketAgainstDelivery`
 * checks `eventType === 'wide'` against `WIDE_VALID_WICKETS` and
 * `eventType === 'no_ball'` against `NO_BALL_VALID_WICKETS`. A stumping off a
 * wide is one of the commonest dismissals in club cricket, and the scorer had
 * no way to record it: arming Wide and then tapping W sent a plain `wicket`
 * and dropped the penalty run on the floor.
 */
export type WicketDelivery = 'fair' | ExtraKind;

/**
 * The run fields for a dismissal, given what the delivery was.
 *
 * `runs` is what the batters completed — or what was struck, off a no ball —
 * before the dismissal. It is not the total, because the penalty belongs to
 * the delivery rather than to them, and asking a scorer to add it themselves
 * is how the no-ball split was got wrong the first time.
 *
 * Byes and leg byes with no runs are not byes at all: nothing was run, so
 * nothing was conceded, and they collapse back to a fair delivery rather than
 * recording a nought-run extra the scorecard would have to explain.
 */
export function wicketDeliveryFor(
  delivery: WicketDelivery,
  runs: number,
): { eventType: BallEventType; runsOffBat: number; extraRuns: number; totalRuns: number } {
  const completed = Math.max(0, runs);
  const isRunOnlyExtra = delivery === 'bye' || delivery === 'leg_bye';

  if (delivery === 'fair' || (isRunOnlyExtra && completed === 0)) {
    return { eventType: 'wicket', runsOffBat: completed, extraRuns: 0, totalRuns: completed };
  }

  // Only a wide and a no ball carry a penalty of their own. Byes and leg byes
  // are the runs and nothing more.
  const penalty = isRunOnlyExtra ? 0 : 1;
  const totalRuns = completed + penalty;
  const { runsOffBat, extraRuns } = splitExtra(delivery, totalRuns);
  return { eventType: delivery, runsOffBat, extraRuns, totalRuns };
}

/**
 * What tapping a run key does while an extra is armed.
 *
 * The console's armed-modifier model means two different things and used to
 * say so nowhere. Arm Wide and tap 4 and you get four wides; arm No ball and
 * tap 4 and you get five, because four came off the bat and the penalty is the
 * delivery's. Same gesture, different arithmetic, explained in a source
 * comment and in no pixel on the screen.
 *
 * The rule lived inline in `scoreRuns`. It is here so the keypad can *show*
 * the answer on the key before it is tapped, and so the number shown and the
 * number recorded come from one function rather than two.
 *
 * Tapping 0 on a wide, bye or leg bye means one of them, not none — a nought-
 * run bye is a dot ball, and the scorer who wanted a dot would not have armed
 * anything.
 */
export function armedTotal(kind: ExtraKind, runsTapped: number): number {
  const runs = Math.max(0, runsTapped);
  if (kind === 'no_ball') return runs + 1;
  return runs === 0 ? 1 : runs;
}

/** Runs a scoring shot puts on the board, by its event type. */
export const RUN_EVENT_TYPE: Record<number, BallEventType> = {
  0: 'dot',
  1: '1',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
};

/**
 * The full delivery a scorer's tap describes — runs or an extra.
 * Returns the three fields every ball payload needs.
 */
export function deliveryFor(
  choice: { kind: 'runs'; runs: number } | { kind: 'extra'; extra: ExtraKind; total: number },
): { eventType: BallEventType; runsOffBat: number; overthrowRuns: number; extraRuns: number } {
  if (choice.kind === 'runs') {
    return {
      eventType: RUN_EVENT_TYPE[choice.runs] ?? 'dot',
      runsOffBat: choice.runs,
      overthrowRuns: 0,
      extraRuns: 0,
    };
  }
  const { runsOffBat, extraRuns } = splitExtra(choice.extra, choice.total);
  return { eventType: choice.extra, runsOffBat, overthrowRuns: 0, extraRuns };
}
