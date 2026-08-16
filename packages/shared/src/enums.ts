/**
 * Canonical enum values for the domain.
 *
 * These mirror the Postgres enums in `apps/web/lib/db/schema.ts`. They live
 * here rather than there because the mobile app needs them and cannot import
 * the Drizzle schema — that would drag the `postgres` driver into a React
 * Native bundle.
 *
 * Duplication is guarded: `apps/web/lib/db/enum-conformance.ts` is a
 * type-only file that fails `tsc` if these lists and the pgEnum definitions
 * ever drift apart. If you add a value here, add it there too — the
 * compiler will tell you.
 */

export const BATTING_STYLES = ['right_hand', 'left_hand'] as const;
export type BattingStyle = (typeof BATTING_STYLES)[number];

export const BOWLING_STYLES = [
  'right_arm_fast',
  'left_arm_fast',
  'right_arm_medium',
  'left_arm_medium',
  'right_arm_spin',
  'left_arm_spin',
  'right_arm_off_break',
  'left_arm_orthodox',
  'leg_break',
  'googly',
  'none',
] as const;
export type BowlingStyle = (typeof BOWLING_STYLES)[number];

export const PLAYER_ROLES = [
  'batsman',
  'bowler',
  'all_rounder',
  'wicket_keeper',
  'wicket_keeper_batsman',
] as const;
export type PlayerRole = (typeof PLAYER_ROLES)[number];

/**
 * What a match calls itself.
 *
 * Deliberately **not** a switch that changes how scoring works. Every value
 * here is the same engine with a different `oversPerInnings`; the format is a
 * label the match wears so its card can say "T20" instead of "20 overs", and
 * so a club can filter their season later.
 *
 * Formats that would need a different engine — Test, The Hundred, box — are
 * absent on purpose. Adding one here would let a scorer pick it and discover
 * mid-match that declarations do not exist.
 */
export const MATCH_FORMATS = ['t20', 'odi', 't10', 'club', 'gully'] as const;
export type MatchFormat = (typeof MATCH_FORMATS)[number];

export const MATCH_STATUSES = [
  'scheduled',
  'live',
  'completed',
  'abandoned',
  'tied',
  'no_result',
] as const;
export type MatchStatusValue = (typeof MATCH_STATUSES)[number];

export const TOSS_DECISIONS = ['bat', 'bowl'] as const;
export type TossDecision = (typeof TOSS_DECISIONS)[number];

export const BALL_TYPES = ['leather', 'tennis', 'synthetic'] as const;
export type BallType = (typeof BALL_TYPES)[number];

export const INNINGS_STATUSES = ['not_started', 'in_progress', 'completed'] as const;
export type InningsStatusValue = (typeof INNINGS_STATUSES)[number];

export const BALL_EVENT_TYPES = [
  'dot',
  '1',
  '2',
  '3',
  '4',
  '6',
  'wide',
  'no_ball',
  'bye',
  'leg_bye',
  'wicket',
] as const;
export type BallEventTypeValue = (typeof BALL_EVENT_TYPES)[number];

export const WICKET_TYPES = [
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
] as const;
export type WicketTypeValue = (typeof WICKET_TYPES)[number];
