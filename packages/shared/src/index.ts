/**
 * Open Innings — shared API contract.
 *
 * Everything the web backend and the mobile client must agree on: enum values,
 * request schemas, response types, and pure helpers. No I/O, no database
 * driver, no framework — so it imports cleanly into a React Native bundle.
 */

export {
  BATTING_STYLES,
  BOWLING_STYLES,
  PLAYER_ROLES,
  MATCH_STATUSES,
  TOSS_DECISIONS,
  BALL_TYPES,
  INNINGS_STATUSES,
  BALL_EVENT_TYPES,
  WICKET_TYPES,
  type BattingStyle,
  type BowlingStyle,
  type PlayerRole,
  type MatchStatusValue,
  type TossDecision,
  type BallType,
  type InningsStatusValue,
  type BallEventTypeValue,
  type WicketTypeValue,
} from './enums';

export {
  emailSchema,
  signupSchema,
  loginSchema,
  createPlayerSchema,
  createTeamSchema,
  updateTeamSchema,
  teamMemberSchema,
  openersSchema,
  createMatchSchema,
  startSecondInningsSchema,
  ballEventSchema,
  changeBowlerSchema,
  nextBatterSchema,
  type SignupInput,
  type LoginInput,
  type CreatePlayerInput,
  type CreateTeamInput,
  type UpdateTeamInput,
  type TeamMemberInput,
  type OpenersInput,
  type CreateMatchInput,
  type StartSecondInningsInput,
  type BallEventBody,
  type ChangeBowlerInput,
  type NextBatterInput,
} from './schemas';

export {
  isApiError,
  HTTP,
  type ApiError,
  type AuthResponse,
  type SessionResponse,
  type MatchSummary,
  type MatchListResponse,
  type PlayerSummary,
  type PlayerListResponse,
  type PlayerResponse,
  type TeamSummary,
  type TeamListResponse,
  type TeamResponse,
  type TeamDetailResponse,
  type TeamMembersResponse,
  type InningsSummary,
  type CreateMatchResponse,
  type MatchDetailResponse,
  type ScorerPlayer,
  type ScorerResponse,
  type BallResponse,
} from './api';

export { resolveBattingSides } from './toss';
