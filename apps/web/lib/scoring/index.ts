/**
 * Open Innings — scoring engine barrel.
 *
 * Re-exports the public API. Importers should depend on this module, not
 * individual files, so the API surface stays small and stable.
 */

export { applyBall } from './engine';
export {
  initialState,
  replayEvents,
  replayInnings,
  replayWithLastRemoved,
} from './compute';
export {
  buildScorecard,
  type ScorecardView,
  type BattingRow,
  type BowlingRow,
  type CurrentBatsmanView,
  type BallChip,
} from './scorecard';
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
  NO_CONSECUTIVE_OVERS,
  BALLS_PER_OVER,
} from './rules';