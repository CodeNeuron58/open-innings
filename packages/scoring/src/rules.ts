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
 * The only ways a batter can be dismissed off a no ball.
 *
 * Per Law 21: a batter may not be Bowled, Caught, LBW, Stumped or Hit wicket
 * off a no ball. What remains is a run out, obstructing the field, and hitting
 * the ball twice.
 *
 * `handled_ball` rides with `obstructing_field` and `double_hit` with
 * `hit_the_ball_twice` throughout this file: the 2017 Code folded the first of
 * each pair into the second, and both spellings survive in the database enum,
 * so a set that named only one would refuse a dismissal it means to allow.
 */
export const NO_BALL_VALID_WICKETS: ReadonlySet<WicketType> = new Set([
  'run_out',
  'obstructing_field',
  'handled_ball',
  'hit_the_ball_twice',
  'double_hit',
]);

/**
 * The only ways a batter can be dismissed off a wide.
 *
 * Per Law 22.6: neither batter may be dismissed except Hit wicket, Obstructing
 * the field, Run out or Stumped. A wide is by definition not hittable, which
 * is why Bowled, Caught and LBW are absent — and why Stumped is here and is
 * the common case.
 */
export const WIDE_VALID_WICKETS: ReadonlySet<WicketType> = new Set([
  'stumped',
  'run_out',
  'hit_wicket',
  'obstructing_field',
  'handled_ball',
]);

/**
 * On a free hit, only the dismissals available off a no ball apply. Per Law
 * 21.18.
 *
 * The **same set**, not a copy of it. This used to be `{run_out}` alone, which
 * is a third of the law — obstructing the field and hitting the ball twice are
 * both available on a free hit. Aliasing rather than restating means the two
 * cannot drift, because they are not two rules: a free hit is defined as
 * carrying a no ball's dismissals.
 *
 * A free hit that is itself called wide is governed by both this and
 * `WIDE_VALID_WICKETS`; the engine applies each check independently, so the
 * intersection — a run out or obstructing the field — falls out on its own.
 */
export const FREE_HIT_VALID_WICKETS: ReadonlySet<WicketType> = NO_BALL_VALID_WICKETS;

/**
 * Dismissals that are not the outcome of the delivery they are recorded
 * against.
 *
 * A retirement happens between deliveries and Timed out happens before one has
 * been bowled. They are attached to a ball event because that is the only
 * place this schema can put them, so the delivery-legality rules above must
 * not be applied to them — otherwise a batter could not retire hurt during an
 * over that happened to contain a wide.
 */
export const NON_DELIVERY_WICKETS: ReadonlySet<WicketType> = new Set([
  'retired_hurt',
  'retired_out',
  'timed_out',
]);

/**
 * Dismissals after which the batter leaves the field and must be replaced.
 *
 * Wider than `TEAM_WICKET_COUNTED` by exactly one: a retired hurt batter walks
 * off without the team losing a wicket, and may return later. The two answer
 * different questions — "has the innings lost a wicket" and "is somebody
 * walking out to bat" — and sharing one set for both is how a retirement ends
 * up inside the partnership it interrupted.
 */
export const BATTER_LEAVES_FIELD: ReadonlySet<WicketType> = new Set([
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
  'retired_hurt',
  'retired_out',
  'double_hit',
  'hit_the_ball_twice',
]);

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
export const BATSMAN_FACING_EXCLUDED_TYPES: ReadonlySet<string> = new Set(['wide', 'penalty']);

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
export const BOWLER_EXEMPT_EXTRAS: ReadonlySet<string> = new Set(['bye', 'leg_bye', 'penalty']);

// ─────────────────────────────────────────────────────────────────────────────
// Law 25 — Wickets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dismissal types that DO credit a wicket to the bowler.
 *
 * There are five, and only five: **bowled, caught, LBW, stumped, hit wicket.**
 * That list is a scoring convention rather than a numbered Law, and it is
 * universal — every scorebook, scoring package and statistical record uses it.
 *
 * Excluded, because the bowler did not take them:
 *   - run_out — the fielding side did
 *   - handled_ball / obstructing_field — the batter's own act
 *   - hit_the_ball_twice / double_hit — likewise the batter's own act
 *   - timed_out — nothing was bowled
 *   - retired_out — retirement is the batter's decision
 *   - retired_hurt — not a wicket at all; they can return
 *
 * `hit_the_ball_twice` and `double_hit` were in this set and should never have
 * been. Law 34 is the batter striking the ball a second time; charging that to
 * the bowler's analysis inflated their wickets on the scorecard, in career
 * figures, and in the club leaderboard — `apps/web/lib/db/stats.ts` and
 * `lib/services/club.ts` both build their SQL from this set, which is exactly
 * why it is the only place the list is written down.
 */
export const BOWLER_CREDITED_WICKETS: ReadonlySet<WicketType> = new Set([
  'bowled',
  'caught',
  'caught_behind',
  'lbw',
  'stumped',
  'hit_wicket',
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
  // wide, no_ball, and penalty are not bowled deliveries — they do not count
  // toward the over's ball tally.
  return eventType !== 'wide' && eventType !== 'no_ball' && eventType !== 'penalty';
}

export function isExtra(eventType: string): boolean {
  return (
    eventType === 'wide' ||
    eventType === 'no_ball' ||
    eventType === 'bye' ||
    eventType === 'leg_bye' ||
    eventType === 'penalty'
  );
}

export function isPenaltyExtra(eventType: string): boolean {
  return eventType === 'wide' || eventType === 'no_ball';
}
