/**
 * Open Innings — MCC Laws of Cricket, machine-readable form.
 *
 * Each constant corresponds to a specific MCC Law. If the ICC or MCC updates
 * a rule, this is the only file that needs to change.
 *
 * Source: MCC Laws of Cricket 2022 (effective 1 October 2022).
 * For our purposes, white-ball (limited-overs) rules apply.
 */

import type { WicketType } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Law 21 — No ball
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Penalty runs awarded for a no-ball.
 * Per MCC Law 21.3: +1 to batting team, plus any runs scored off the delivery.
 */
export const NO_BALL_PENALTY = 1;

/**
 * On a free hit (the ball after a no-ball in limited-overs cricket),
 * only a run-out can dismiss the batsman. Per Law 21.18.
 */
export const FREE_HIT_VALID_WICKETS: ReadonlySet<WicketType> = new Set(['run_out']);

// ─────────────────────────────────────────────────────────────────────────────
// Law 22 — Wide
// ─────────────────────────────────────────────────────────────────────────────

/** Penalty runs for a wide. Per Law 22.2. */
export const WIDE_PENALTY = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Law 24 — Leg bye / Law 23 — Bye
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deliveries that do NOT count as a ball faced by the striker.
 *
 * Only a wide, and that is the whole list. A wide is not a fair delivery to
 * the batter, so it is not one they faced; everything else is.
 *
 * This used to also exclude byes and leg-byes, citing Laws 23 and 24. Those
 * laws govern who is credited with the *runs* — the answer being nobody, they
 * are extras — and say nothing about who faced the ball. A batter who plays
 * out an over of leg-byes has faced six deliveries and scored none, and their
 * strike rate is 0.00 off six, not 0.00 off zero.
 *
 * A no-ball counts too: it is illegal for the bowler, but the batter still
 * had a chance to hit it.
 *
 * Mirrored by `battingInningsFor` in apps/web/lib/db/stats.ts. The two
 * disagreed in both directions before this — the SQL counted leg-byes and
 * dropped no-balls, the engine did the reverse — so the same innings produced
 * one strike rate on a match card and another on a career page.
 */
export const BATSMAN_FACING_EXCLUDED_TYPES: ReadonlySet<string> = new Set(['wide']);

/**
 * Extras that are NOT charged to the bowler's analysis.
 *
 * A bye beat the wicketkeeper and a leg-bye came off the batter's pad. Law 24
 * puts neither on the bowler, so neither enters runs conceded, economy, or the
 * question of whether an over was a maiden. Wide and no-ball penalties are
 * charged, because those are the bowling's own fault.
 *
 * Mirrored by `bowlingInningsFor` in apps/web/lib/db/stats.ts, which sums
 * career figures straight from the ball log. If the two ever disagree, a
 * bowler's economy on a match card contradicts their career page.
 */
export const BOWLER_EXEMPT_EXTRAS: ReadonlySet<string> = new Set(['bye', 'leg_bye']);

// ─────────────────────────────────────────────────────────────────────────────
// Law 25 — Wickets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dismissal types that DO credit a wicket to the bowler.
 * Per Law 25.7 + 25.8 + 25.10 + 25.11 + 25.12 + 25.15.
 *
 * Excluded:
 *   - run_out (Law 25.5: bowler doesn't get credit)
 *   - handled_ball (Law 25.3)
 *   - obstructing_field (Law 25.4)
 *   - timed_out (Law 25.6)
 *   - retired_out (Law 25.5 — retirement is the batsman's action)
 *   - retired_hurt (not a real wicket — can return)
 */
export const BOWLER_CREDITED_WICKETS: ReadonlySet<WicketType> = new Set([
  'bowled',
  'caught',
  'caught_behind',
  'lbw',
  'stumped',
  'hit_wicket',
  'double_hit',
  'hit_the_ball_twice',
]);

/**
 * Wicket types that count toward the team's total wicket count
 * (i.e. innings ends at 10 — or 2 for Super Over).
 *
 * Excluded: retired_hurt (Law 25.5 — can return).
 */
export const TEAM_WICKET_COUNTED: ReadonlySet<WicketType> = new Set([
  'bowled',
  'caught',
  'caught_behind',
  'lbw',
  'run_out',
  'stumped',
  'hit_wicket',
  'handled_ball',
  'obstructing_field',
  'timed_out',
  'retired_out',
  'double_hit',
  'hit_the_ball_twice',
]);

/**
 * Dismissal types that REQUIRE a fielder to be specified.
 * Caught variants need the fielder; run-out needs the throwing fielder.
 */
export const REQUIRES_FIELDER: ReadonlySet<WicketType> = new Set([
  'caught',
  'caught_behind',
  'run_out',
  'stumped',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Law 12 — Innings
// ─────────────────────────────────────────────────────────────────────────────

/** Standard limited-overs wickets fall at 10. Super Over caps at 2. */
export const STANDARD_MAX_WICKETS = 10;
export const SUPER_OVER_MAX_WICKETS = 2;

/** A Super Over is one over, whatever length the match itself was. */
export const SUPER_OVER_OVERS = 1;

/**
 * Per Law 16.2, a bowler may not bowl two consecutive overs.
 * We surface this as a soft error to the scorer UI.
 */
export const NO_CONSECUTIVE_OVERS = true;

// ─────────────────────────────────────────────────────────────────────────────
// Law 18.6 — Overthrows / fielding penalties
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Overthrow runs are credited as runs off the bat in v0.1.
 * We do NOT separately track overthrow vs runs completed.
 * For v0.2, consider splitting `runsOffBat` into `runsHit + overthrowRuns`.
 */
export const TREAT_OVERTHROWS_AS_BAT_RUNS = true;

// ─────────────────────────────────────────────────────────────────────────────
// Display defaults
// ─────────────────────────────────────────────────────────────────────────────

/** Standard format: overs displayed as "12.3" (12 complete + 3 of 13th). */
export const BALLS_PER_OVER = 6;

// ─────────────────────────────────────────────────────────────────────────────
// Derived constants
// ─────────────────────────────────────────────────────────────────────────────

export function isLegalDelivery(eventType: string): boolean {
  // wide and no_ball are illegal — every other type is legal
  return eventType !== 'wide' && eventType !== 'no_ball';
}

export function isExtra(eventType: string): boolean {
  return (
    eventType === 'wide' ||
    eventType === 'no_ball' ||
    eventType === 'bye' ||
    eventType === 'leg_bye'
  );
}

export function isPenaltyExtra(eventType: string): boolean {
  return eventType === 'wide' || eventType === 'no_ball';
}
