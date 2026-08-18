/**
 * How an extra splits into the batter's runs and the side's.
 *
 * One rule, in one place, because it existed in two and the second copy was
 * already wrong. The scorer's extras sheet split a no-ball correctly — the
 * one-run penalty is the extra, and anything beyond it was struck, so it
 * belongs to the batter — while the correction sheet put the whole total into
 * `extraRuns`. A no-ball the batter hit for four would have recorded five
 * extras and **nothing to the batter**, which is silently wrong on the career
 * page that is the reason the app exists.
 *
 * Nothing would have caught it. The payload typechecks, the schema accepts it
 * (a no-ball may legitimately carry six extras), and the engine has no way to
 * know the four was struck rather than conceded. It is only wrong against the
 * cricket, which is why the rule needs one home and a test rather than a
 * careful reader.
 */
import type { BallEventType } from '@open-innings/scoring';

export type ExtraKind = 'wide' | 'no_ball' | 'bye' | 'leg_bye';

/**
 * Totals a scorer can pick, per extra.
 *
 * Wides and no-balls always carry their one-run penalty, so totals start at 1.
 * A no-ball reaches **7** — the penalty plus a six struck off it — and that
 * extra option is the one a five-wide grid quietly drops.
 *
 * Byes and leg-byes have no penalty, so their minimum is a genuine completed
 * run: a "0 bye" is not a bye, it is a dot ball.
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
 *
 * A wide is never touched by the bat, so all of it is extras. A no-ball
 * carries a fixed one-run penalty and anything past that was struck. Byes and
 * leg-byes come off the pad or the keeper and are entirely extras.
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
 *
 * Returned as the three fields every ball payload needs, so a caller cannot
 * assemble two of them and forget the third. Both the record path and the
 * correction path go through here.
 */
export function deliveryFor(
  choice: { kind: 'runs'; runs: number } | { kind: 'extra'; extra: ExtraKind; total: number },
): { eventType: BallEventType; runsOffBat: number; extraRuns: number } {
  if (choice.kind === 'runs') {
    return {
      eventType: RUN_EVENT_TYPE[choice.runs] ?? 'dot',
      runsOffBat: choice.runs,
      extraRuns: 0,
    };
  }
  const { runsOffBat, extraRuns } = splitExtra(choice.extra, choice.total);
  return { eventType: choice.extra, runsOffBat, extraRuns };
}
