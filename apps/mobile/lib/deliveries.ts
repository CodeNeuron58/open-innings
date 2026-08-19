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
