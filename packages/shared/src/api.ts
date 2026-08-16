import type { BattingStyle, BowlingStyle, PlayerRole } from './enums';

/**
 * The API's error contract.
 *
 * This codifies the convention the ball endpoint already established rather
 * than inventing a new one: success returns a bare payload with a 2xx status,
 * failure returns `{ error }` with a non-2xx status. No `{ ok: true }`
 * envelope — HTTP already carries that bit, and wrapping every success forces
 * clients to unwrap twice.
 */

/** Failure body. `code` is set when the scoring engine rejected the ball. */
export type ApiError = {
  error: string;
  /** `ScoringError.code` — lets clients branch on the rule that was broken. */
  code?: string;
  /** Schema path that failed, e.g. `openingNonStrikerId`. */
  field?: string;
};

/** Narrow an arbitrary parsed JSON body to a failure. */
export function isApiError(body: unknown): body is ApiError {
  return typeof body === 'object' && body !== null && typeof (body as ApiError).error === 'string';
}

/**
 * What `POST /api/auth/login` and `/signup` return to a native client.
 *
 * The web ignores this and reads the `Set-Cookie` header instead. Mobile
 * stores `token` in secure storage and sends it as `Authorization: Bearer`.
 * The token is the same opaque session token either way.
 */
export type AuthResponse = {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
};

/** `GET /api/auth/session` — who am I? */
export type SessionResponse = {
  user: AuthResponse['user'] | null;
};

/**
 * A match as the list and detail endpoints return it.
 *
 * A structural subset of the `matches` row. The mobile client can't import the
 * Drizzle type — that would pull the `postgres` driver into a React Native
 * bundle — so the fields it actually reads are declared here instead.
 *
 * Narrower than the row on purpose: adding a column shouldn't oblige the app
 * to know about it. But renaming one the app *does* read must break
 * compilation, which is why this lives in shared rather than in apps/mobile.
 */
export type MatchSummary = {
  id: string;
  title: string | null;
  venue: string | null;
  status: string;
  oversPerInnings: number;
  /** 't20', 'club', … — a label, null for matches created before it existed. */
  format: string | null;
  teamAId: string;
  teamBId: string;
  result: string | null;
  summary: string | null;
  startedAt: string | null;
  createdAt: string;
  /**
   * How many people are reading this match's public scorecard right now.
   *
   * Presence, not followers — nobody subscribes to anything. Zero is a real
   * answer and usually the right one for a match nobody has shared yet.
   */
  watching: number;
};

/** `GET /api/matches` */
export type MatchListResponse = {
  matches: MatchSummary[];
};

/** A player as the API returns it. Structural subset of the `players` row. */
export type PlayerSummary = {
  id: string;
  fullName: string;
  shortName: string | null;
  battingStyle: BattingStyle | null;
  bowlingStyle: BowlingStyle | null;
  role: PlayerRole | null;
};

/**
 * A player **within a squad**.
 *
 * Captaincy and keeping are properties of the membership, not of the person —
 * the same player captains one club and bats at six for another — so they are
 * only meaningful in a team context and only appear on this type.
 */
export type SquadMemberSummary = PlayerSummary & {
  isCaptain: boolean;
  isWicketkeeper: boolean;
};

export type PlayerListResponse = { players: PlayerSummary[] };
export type PlayerResponse = { player: PlayerSummary };

/** A team as the API returns it. Structural subset of the `teams` row. */
export type TeamSummary = {
  id: string;
  name: string;
  shortName: string | null;
  homeGround: string | null;
};

export type TeamListResponse = { teams: TeamSummary[] };
export type TeamResponse = { team: TeamSummary };

/** `GET /api/teams/[id]` — the team plus its squad. */
export type TeamDetailResponse = {
  team: TeamSummary;
  members: SquadMemberSummary[];
};

/** Squad mutations return the squad as it now stands, so the client can't drift. */
export type TeamMembersResponse = { members: SquadMemberSummary[] };

/** An innings as the API returns it. */
export type InningsSummary = {
  id: string;
  matchId: string;
  inningsNumber: number;
  battingTeamId: string;
  bowlingTeamId: string;
  runs: number;
  wickets: number;
  ballsBowled: number;
  extras: number;
  target: number | null;
  status: string;
  maxWickets: number;
  openingStrikerId: string | null;
  openingNonStrikerId: string | null;
  openingBowlerId: string | null;
};

/** `POST /api/matches` */
export type CreateMatchResponse = {
  match: MatchSummary;
  inning: InningsSummary;
};

/** `GET /api/matches/[id]` */
export type MatchDetailResponse = {
  match: MatchSummary;
  innings: InningsSummary[];
};

/** A player as the scorer screen needs them — id and a name to show. */
export type ScorerPlayer = {
  id: string;
  fullName: string;
};

/**
 * `GET /api/matches/[id]/scorer` — one call, everything the scorer renders.
 *
 * `state` is deliberately typed as `unknown` here rather than importing
 * `MatchState` from @open-innings/scoring. This package is the API contract
 * and must not depend on the engine; the client casts it after import. The
 * engine owns that type, and duplicating it here is how the two drift.
 */
export type ScorerResponse = {
  /** MatchState from @open-innings/scoring — cast on the client. */
  state: unknown;
  /** Both squads, so the wicket sheet can offer any fielder. */
  players: ScorerPlayer[];
  battingSquad: ScorerPlayer[];
  bowlingSquad: ScorerPlayer[];
  battingTeamName: string;
  bowlingTeamName: string;
  matchTitle: string | null;
  matchStatus: string;
  matchSummary: string | null;
  /** Innings 1 is complete and the chase hasn't been opened yet. */
  awaitingSecondInnings: boolean;
  /** Openers for the chase come from the sides swapped round. */
  nextBattingSquad: ScorerPlayer[];
  nextBowlingSquad: ScorerPlayer[];
  firstInningsRuns: number | null;
  /** Readers on the public scorecard right now. See MatchSummary.watching. */
  watching: number;
};

/** `POST`/`DELETE /api/matches/[id]/ball` — the replayed state after the change. */
export type BallResponse = {
  /** MatchState from @open-innings/scoring — cast on the client. */
  state: unknown;
};

/**
 * One standout performance. The pair is always "the figure that ranks them"
 * then "the tiebreaker": runs and balls, wickets and runs conceded, sixes and
 * balls.
 */
export type MatchPerformer = {
  playerId: string;
  name: string;
  primary: number;
  secondary: number;
};

/**
 * `GET /api/matches/[id]/summary` — the match as the result screen shows it.
 *
 * Named `MatchResultResponse` rather than after its route because
 * `MatchSummary` above is already taken by the row in the matches list, and
 * two types called the same thing meaning different things is how a client
 * ends up rendering one where it meant the other.
 *
 * Both innings, folded server-side. The scorer endpoint replays only the
 * innings in progress, so this is the only shape that can describe a finished
 * match.
 */
export type MatchResultResponse = {
  matchId: string;
  title: string | null;
  venue: string | null;
  status: string;
  /** "Koramangala XI won by 4 wickets" — the server's own result line. */
  result: string | null;
  innings: { teamName: string; runs: number; wickets: number; overs: string }[];
  topScorer: MatchPerformer | null;
  bestBowler: MatchPerformer | null;
  mostSixes: MatchPerformer | null;
  /**
   * Computed, never voted on: runs plus twenty per wicket. Present it as "who
   * had the biggest game", not as an award — see the service for why.
   */
  playerOfTheMatch: { playerId: string; name: string; line: string } | null;
};

/** One delivery, with names already resolved so the client renders no ids. */
export type CardDelivery = {
  overNumber: number;
  ballNumber: number;
  eventType: string;
  runsOffBat: number;
  extraRuns: number;
  totalRuns: number;
  isLegalDelivery: boolean;
  batsmanName: string;
  bowlerName: string;
  wicketType: string | null;
  outBatterName: string | null;
  fielderName: string | null;
  /** A scorer's own note, if they wrote one. Wins over generated commentary. */
  commentary: string | null;
};

/** One innings, in full. */
export type CardInnings = {
  inningsNumber: number;
  battingTeamName: string;
  bowlingTeamName: string;
  runs: number;
  wickets: number;
  overs: string;
  target: number | null;
  batting: {
    playerId: string;
    playerName: string;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    strikeRate: string;
    isOut: boolean;
    dismissalText: string | null;
  }[];
  bowling: {
    playerId: string;
    playerName: string;
    overs: string;
    maidens: number;
    runs: number;
    wickets: number;
    economy: string;
  }[];
  extras: { total: number; wides: number; noBalls: number; byes: number; legByes: number };
  fallOfWickets: { wicketNumber: number; runsAtFall: number; oversAtFall: string; name: string }[];
  /** Oldest first, exactly as bowled. Group and reverse for display. */
  deliveries: CardDelivery[];
};

/**
 * `GET /api/matches/[id]/card` — the full record.
 *
 * The heavy call: it carries every ball of the match. Fetch once and switch
 * tabs locally rather than per view.
 */
export type MatchCardResponse = {
  matchId: string;
  title: string | null;
  venue: string | null;
  status: string;
  result: string | null;
  innings: CardInnings[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Career statistics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A batting record, career or single season.
 *
 * `average` and `strikeRate` are nullable for different reasons, and the
 * difference matters: a strike rate needs balls faced, an average needs a
 * dismissal. A batter who is 40* off 20 has a strike rate of 200 and no
 * average at all. Rendering either as 0 or Infinity is wrong.
 */
export type BattingCareerView = {
  innings: number;
  notOuts: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  highScore: number;
  /** The high score was unbeaten — render it as "84*". */
  highScoreNotOut: boolean;
  fifties: number;
  hundreds: number;
  average: number | null;
  strikeRate: number | null;
};

/** A bowling record. All three rates are null until there is a wicket. */
export type BowlingCareerView = {
  innings: number;
  balls: number;
  runs: number;
  wickets: number;
  bestWickets: number;
  bestRuns: number;
  fiveFors: number;
  average: number | null;
  /** Runs per over — needs balls, not wickets, so it outlives the others. */
  economy: number | null;
  strikeRate: number | null;
};

/** One recent innings, for the form strip. */
export type FormEntryView = {
  matchId: string;
  /** ISO string — this crossed a JSON boundary, so it is not a Date. */
  playedAt: string | null;
  opponent: string | null;
  runs: number;
  balls: number;
  notOut: boolean;
};

/** `GET /api/players/[id]/stats` — public, no session required. */
export type PlayerCareerResponse = {
  career: {
    player: {
      id: string;
      fullName: string;
      /** All nullable — a squad player is often just a name. */
      role: PlayerRole | null;
      battingStyle: BattingStyle | null;
      bowlingStyle: BowlingStyle | null;
    };
    /** Distinct matches — not batting innings plus bowling innings. */
    matches: number;
    batting: BattingCareerView;
    bowling: BowlingCareerView;
    fielding: { catches: number; runOuts: number; stumpings: number };
    /** Null when the player has only ever played one season. */
    season: { label: string; batting: BattingCareerView; bowling: BowlingCareerView } | null;
    form: FormEntryView[];
    milestones: {
      label: string;
      /** Appearances ago, not days — 0 is the most recent match played. */
      matchesAgo: number;
    }[];
  };
};

/**
 * `GET /api/teams/[id]/club` — a club's public home.
 *
 * `leaders` are **career** figures for current squad members, not club-only
 * ones. Attributing a run to a club would mean knowing which side a player
 * turned out for in each innings, and players turn out for more than one — so
 * the label says "career" rather than quietly getting it wrong.
 */
export type ClubLeaderView = { playerId: string; name: string; value: number };

export type ClubPageResponse = {
  team: { id: string; name: string };
  squad: {
    id: string;
    fullName: string;
    role: PlayerRole | null;
    isCaptain: boolean;
    isWicketkeeper: boolean;
  }[];
  results: {
    matchId: string;
    /** ISO string — this crossed a JSON boundary, so it is not a Date. */
    playedAt: string | null;
    opponent: string | null;
    status: string;
    summary: string | null;
  }[];
  leaders: {
    runs: ClubLeaderView | null;
    wickets: ClubLeaderView | null;
    /** Career strike rate, over a minimum of balls faced. */
    strikeRate: ClubLeaderView | null;
    catches: ClubLeaderView | null;
  };
};

/**
 * Enough of a career to tell two people with the same name apart.
 *
 * Deliberately not a shrunken `PlayerCareerResponse` — it answers a different
 * question. This one is read *while choosing* a player from a list; that one
 * is read about a player already chosen.
 *
 * Career totals, not this season's. A season filter would need a season, and
 * a picker showing nothing for everyone who has not played since January is
 * worse than one showing a career.
 */
export type PlayerBrief = {
  playerId: string;
  matches: number;
  runs: number;
  battingBalls: number;
  wickets: number;
  bowlingRuns: number;
  bowlingBalls: number;
};

/** `GET /api/players/briefs?ids=a,b,c` — career context for a list. */
export type PlayerBriefsResponse = { briefs: PlayerBrief[] };

/** Standard HTTP statuses this API uses, named so handlers read clearly. */
export const HTTP = {
  ok: 200,
  created: 201,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  tooManyRequests: 429,
  serverError: 500,
} as const;
