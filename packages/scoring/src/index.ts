/**
 * Open Innings — scoring engine barrel.
 *
 * Re-exports the public API. Importers should depend on this module, not
 * individual files, so the API surface stays small and stable.
 */

export { applyBall, type ApplyBallOptions } from './engine';
export { initialState, replayEvents, replayInnings, replayWithLastRemoved } from './compute';
export {
  buildScorecard,
  type ScorecardView,
  type BattingRow,
  type BowlingRow,
  type CurrentBatsmanView,
  type BallChip,
} from './scorecard';
export {
  describeBall,
  groupIntoOvers,
  ballLabel,
  ballInOverFor,
  type BallContext,
  type OverSummary,
} from './commentary';
export {
  formatOvers,
  maxLegalBallsForOvers,
  currentRunRate,
  requiredRunRate,
  isEndOfOver,
  shouldSwapStrike,
  isMaidenOver,
  rotateStrike,
  emptyBatsmanStats,
  emptyBowlerStats,
  overNumberFor,
  ballNumberInOver,
  playerIdKey,
} from './helpers';
export {
  ScoringError,
  type BallEvent,
  type BallEventInput,
  type BallViolation,
  type MatchState,
  type InningsState,
  type BatsmanStats,
  type BowlerStats,
  type Partnership,
  type FallOfWicket,
  type BallEventType,
  type WicketType,
  type MatchStatus,
  type InningsStatus,
  type MatchId,
  type InningsId,
  type PlayerId,
  type TeamId,
  asMatchId,
  asInningsId,
  asPlayerId,
  asTeamId,
} from './types';
export {
  STANDARD_MAX_WICKETS,
  SUPER_OVER_MAX_WICKETS,
  SUPER_OVER_OVERS,
  NO_CONSECUTIVE_OVERS,
  BALLS_PER_OVER,
  // Which extras stay off the bowler's analysis. Exported for the same reason
  // as the dismissal sets below: apps/web/lib/db/stats.ts computes career
  // bowling figures straight from the ball log, and a second hand-written copy
  // of Law 24 there would disagree with this one the first time either moved.
  BOWLER_EXEMPT_EXTRAS,
  BATSMAN_FACING_EXCLUDED_TYPES,
  // The dismissal classifications. Exported because career statistics are
  // derived from the ball log outside this package, and re-stating "which
  // dismissals credit the bowler" anywhere else would create a second source
  // of truth for Law 25 that drifts the first time a type is added.
  BOWLER_CREDITED_WICKETS,
  TEAM_WICKET_COUNTED,
  REQUIRES_FIELDER,
  // Which dismissals a given delivery could have produced — Laws 21, 22.6 and
  // 21.18. Exported alongside the sets above for the same reason: anything
  // that needs to describe a legal dismissal should ask, not restate.
  NO_BALL_VALID_WICKETS,
  WIDE_VALID_WICKETS,
  FREE_HIT_VALID_WICKETS,
  NON_DELIVERY_WICKETS,
  BATTER_LEAVES_FIELD,
} from './rules';
