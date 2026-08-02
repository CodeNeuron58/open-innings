/**
 * Compile-time guard: the Postgres enums and the shared enum lists must agree.
 *
 * `@open-innings/shared` restates these values because the mobile app can't
 * import this schema — doing so would pull the `postgres` driver into a React
 * Native bundle. Restating means they can drift, and drift here is nasty: the
 * app offers a bowling style the database will reject, and you find out in
 * production.
 *
 * So this file exists purely to make drift a `tsc` failure. It emits no
 * runtime code. If it stops compiling, a value was added or renamed on one
 * side only — fix the mismatch, don't relax the assertion.
 */
import type {
  BattingStyle,
  BowlingStyle,
  PlayerRole,
  MatchStatusValue,
  TossDecision,
  BallType,
  InningsStatusValue,
  BallEventTypeValue,
  WicketTypeValue,
} from '@open-innings/shared';
import type {
  battingStyle,
  bowlingStyle,
  playerRole,
  matchStatus,
  tossDecision,
  ballType,
  inningsStatus,
  ballEventType,
  wicketType,
} from './schema';

/**
 * True only if A and B are the same union.
 *
 * The tuple wrappers stop the conditional distributing over union members —
 * without them, `'a' | 'b' extends 'a'` would be evaluated one member at a
 * time and a missing value would slip through. Mismatches resolve to `false`
 * rather than `never`, because `never` satisfies every constraint and would
 * make the assertion below silently vacuous.
 */
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Compiles only when handed `true`. */
type Assert<T extends true> = T;

type DbEnum<T> = T extends { enumValues: readonly (infer V)[] } ? V : never;

// One line per enum. A value added or renamed on one side breaks its line.
export type _BattingStyle = Assert<Equals<BattingStyle, DbEnum<typeof battingStyle>>>;
export type _BowlingStyle = Assert<Equals<BowlingStyle, DbEnum<typeof bowlingStyle>>>;
export type _PlayerRole = Assert<Equals<PlayerRole, DbEnum<typeof playerRole>>>;
export type _MatchStatus = Assert<Equals<MatchStatusValue, DbEnum<typeof matchStatus>>>;
export type _TossDecision = Assert<Equals<TossDecision, DbEnum<typeof tossDecision>>>;
export type _BallType = Assert<Equals<BallType, DbEnum<typeof ballType>>>;
export type _InningsStatus = Assert<Equals<InningsStatusValue, DbEnum<typeof inningsStatus>>>;
export type _BallEventType = Assert<Equals<BallEventTypeValue, DbEnum<typeof ballEventType>>>;
export type _WicketType = Assert<Equals<WicketTypeValue, DbEnum<typeof wicketType>>>;
