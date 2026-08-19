/**
 * The API client.
 *
 * Every request authenticates with `Authorization: Bearer <token>` — never a
 * cookie. The server accepts both transports, but a native client has no
 * cookie jar, and being explicit means a request that forgets the token fails
 * loudly rather than silently succeeding off ambient state.
 *
 * Request and response shapes come from @open-innings/shared, so a field
 * renamed on the server breaks compilation here rather than at runtime on
 * someone's phone.
 */
import {
  isApiError,
  type AuthResponse,
  type SessionResponse,
  type MatchListResponse,
  type MatchSummary,
  type MatchDetailResponse,
  type CreateMatchInput,
  type CreateMatchResponse,
  type PlayerListResponse,
  type PlayerResponse,
  type PlayerSearchResponse,
  type MergePlayersResponse,
  type PatchBallInput,
  type BallCorrectionResponse,
  type BallCorrectionChange,
  type CreatePlayerInput,
  type TeamListResponse,
  type TeamResponse,
  type TeamDetailResponse,
  type TeamMembersResponse,
  type CreateTeamInput,
  type ScorerResponse,
  type BallResponse,
  type MatchResultResponse,
  type MatchCardResponse,
  type StartNextInningsInput,
  type UpdateMatchInput,
  type UpdateTeamMemberInput,
  type PlayerCareerResponse,
  type PlayerBriefsResponse,
  type ClubPageResponse,
} from '@open-innings/shared';
import type { BallEventInput, MatchState } from '@open-innings/scoring';
import { API_BASE, MISSING_API_BASE_MESSAGE } from './config';

/** A non-2xx response, carrying the server's `{ error }` contract. */
export class ApiError extends Error {
  readonly status: number;
  readonly field?: string;
  /** `ScoringError.code` when the engine rejected a delivery. */
  readonly code?: string;

  constructor(message: string, status: number, opts?: { field?: string; code?: string }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.field = opts?.field;
    this.code = opts?.code;
  }

  /** True when the session is gone — the caller should send the user to login. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

/** The network never reached the server (aeroplane mode, wrong LAN, server down). */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
};

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_BASE) throw new NetworkError(MISSING_API_BASE_MESSAGE);

  const { method = 'GET', body, token, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    });
    // Bound but not yet forwarded. The underlying failure belongs on the
    // thrown error as `{ cause }` so a report carries the real reason (DNS,
    // TLS, refused) rather than only our friendly sentence.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- to forward as NetworkError cause
  } catch (cause) {
    // fetch only rejects on transport failure; HTTP errors resolve normally.
    throw new NetworkError(
      `Couldn't reach the server at ${API_BASE}. Check it's running and on the same network.`,
    );
  }

  // 204 and friends have no body to parse.
  const text = await response.text();
  const parsed: unknown = text.length > 0 ? safeJson(text) : null;

  if (!response.ok) {
    if (isApiError(parsed)) {
      throw new ApiError(parsed.error, response.status, {
        field: parsed.field,
        code: parsed.code,
      });
    }
    throw new ApiError(`Request failed (${response.status})`, response.status);
  }

  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ─── Endpoints ───────────────────────────────────────────────────────────────
// Thin named wrappers rather than callers assembling paths by hand, so the
// route list lives in one place and typos are compile errors.

export const api = {
  signup: (body: { email: string; password: string; displayName?: string }) =>
    apiFetch<AuthResponse>('/api/auth/signup', { method: 'POST', body }),

  login: (body: { email: string; password: string }) =>
    apiFetch<AuthResponse>('/api/auth/login', { method: 'POST', body }),

  logout: (token: string) => apiFetch<unknown>('/api/auth/logout', { method: 'POST', token }),

  /**
   * Send (or resend) the confirmation link for the signed-in account.
   *
   * `mailConfigured` comes back so the caller can tell "we sent it" from
   * "this build has no mail provider" — the second reads as a bug to whoever
   * is waiting on an inbox, and saying "check your email" when nothing left
   * the building is the worst available answer.
   */
  sendVerification: (token: string) =>
    apiFetch<{ sent: boolean; mailConfigured: boolean }>('/api/auth/verify', {
      method: 'POST',
      token,
    }),

  /**
   * Check the six digits from the confirmation email.
   *
   * Authenticated, unlike the link flow it replaces, and that is what makes a
   * short code safe: the server looks the code up by *this* account, so a
   * guesser has to already be signed in as the person whose address they are
   * trying to prove, and their five attempts are counted against that one
   * account rather than sprayed across every account at once.
   */
  confirmEmail: (token: string, code: string) =>
    apiFetch<{ verified: boolean; alreadyVerified: boolean }>('/api/auth/verify', {
      method: 'PUT',
      body: { code },
      token,
    }),

  /**
   * Ask for a password-reset link.
   *
   * Unauthenticated, necessarily — somebody who could sign in would not be
   * asking. The response never says whether the address has an account, so
   * there is nothing here to branch on and the server's own sentence is what
   * should be shown.
   */
  requestPasswordReset: (email: string) =>
    apiFetch<{ message: string }>('/api/auth/reset', { method: 'POST', body: { email } }),

  /**
   * Delete your own account.
   *
   * The password goes with it, on a DELETE, which is unusual and right here:
   * a session proves who signed in, not who is holding the phone now, and
   * this is the one action in the app that cannot be undone.
   *
   * What comes back is what *survived* — matches, squads, the released player
   * claim — because that is the half people need to understand. A screen that
   * says only "account deleted" leaves somebody wondering what happened to
   * their club's season.
   */
  deleteAccount: (token: string, password: string) =>
    apiFetch<{
      deleted: boolean;
      kept: { matchesKept: number; teamsKept: number; playerReleased: boolean };
    }>('/api/me', { method: 'DELETE', body: { password, confirm: true }, token }),

  /**
   * Say which player on the field this account is.
   *
   * Only a player you created and nobody else has claimed. An account and a
   * player stay separate things — this is the join, made deliberately.
   */
  claimPlayer: (token: string, playerId: string) =>
    apiFetch<{ playerId: string }>('/api/me/player', { method: 'PUT', body: { playerId }, token }),

  releasePlayer: (token: string) =>
    apiFetch<{ playerId: null }>('/api/me/player', { method: 'DELETE', token }),

  session: (token: string, signal?: AbortSignal) =>
    apiFetch<SessionResponse>('/api/auth/session', { token, signal }),

  matches: (token: string, signal?: AbortSignal) =>
    apiFetch<MatchListResponse>('/api/matches', { token, signal }),

  match: (token: string, id: string, signal?: AbortSignal) =>
    apiFetch<MatchDetailResponse>(`/api/matches/${id}`, { token, signal }),

  createMatch: (token: string, body: CreateMatchInput) =>
    apiFetch<CreateMatchResponse>('/api/matches', { method: 'POST', body, token }),

  players: (token: string, signal?: AbortSignal) =>
    apiFetch<PlayerListResponse>('/api/players', { token, signal }),

  /**
   * Find a player anywhere on Open Innings, not only in your own list.
   *
   * The call the add-a-player screen was always described as making. It could
   * not: the server scoped every player search to whoever created the row, so
   * two clubs scoring the same cricketer built two half-careers that nothing
   * could join — while the screen promised the opposite.
   *
   * `scope: 'all'` is what makes a career portable. It is not the default,
   * because "my players" is still the right list when you are picking a squad
   * you already know.
   */
  searchPlayers: (
    token: string,
    q: string,
    opts: { scope?: 'mine' | 'all'; limit?: number; signal?: AbortSignal } = {},
  ) => {
    const params = new URLSearchParams({ q });
    if (opts.scope) params.set('scope', opts.scope);
    if (opts.limit) params.set('limit', String(opts.limit));
    return apiFetch<PlayerSearchResponse>(`/api/players?${params.toString()}`, {
      token,
      signal: opts.signal,
    });
  },

  /**
   * Fold a duplicate into the player who keeps their career.
   *
   * `confirm` is not ceremony — a merge rewrites the ball log, which is the
   * only record there is, and there is no undo for it.
   */
  mergePlayer: (token: string, keepId: string, duplicateId: string) =>
    apiFetch<MergePlayersResponse>(`/api/players/${keepId}/merge`, {
      method: 'POST',
      body: { duplicateId, confirm: true },
      token,
    }),

  /*
   * ── Public endpoints ──────────────────────────────────────────────────────
   *
   * These take `string | null` rather than `string`, and that is the whole
   * mechanism behind guest mode. They are public on the server — a scorecard,
   * a career and a club open for anyone with the link, with or without the
   * app — so the client must be able to call them with no credential.
   *
   * The token is still passed when there is one. It changes nothing today,
   * and means these calls do not become the odd ones out if any of them ever
   * needs to know who is asking.
   */

  /** A player's career record. */
  playerStats: (token: string | null, playerId: string, signal?: AbortSignal) =>
    apiFetch<PlayerCareerResponse>(`/api/players/${playerId}/stats`, { token, signal }),

  createPlayer: (token: string, body: CreatePlayerInput) =>
    apiFetch<PlayerResponse>('/api/players', { method: 'POST', body, token }),

  teams: (token: string, signal?: AbortSignal) =>
    apiFetch<TeamListResponse>('/api/teams', { token, signal }),

  createTeam: (token: string, body: CreateTeamInput & { playerIds?: string[] }) =>
    apiFetch<TeamResponse>('/api/teams', { method: 'POST', body, token }),

  team: (token: string, id: string, signal?: AbortSignal) =>
    apiFetch<TeamDetailResponse>(`/api/teams/${id}`, { token, signal }),

  addTeamMember: (token: string, teamId: string, playerId: string) =>
    apiFetch<TeamMembersResponse>(`/api/teams/${teamId}/members`, {
      method: 'POST',
      body: { playerId },
      token,
    }),

  removeTeamMember: (token: string, teamId: string, playerId: string) =>
    apiFetch<TeamMembersResponse>(`/api/teams/${teamId}/members`, {
      method: 'DELETE',
      body: { playerId },
      token,
    }),

  /**
   * Captaincy, keeping and the jersey number.
   *
   * Both flags are exclusive within a squad — the server releases whoever held
   * one — and every field is optional, so setting a jersey number does not
   * quietly strip a captaincy.
   */
  updateTeamMember: (token: string, teamId: string, body: UpdateTeamMemberInput) =>
    apiFetch<TeamMembersResponse>(`/api/teams/${teamId}/members`, {
      method: 'PATCH',
      body,
      token,
    }),

  // ── Scoring ────────────────────────────────────────────────────────────────

  scorer: (token: string, matchId: string, signal?: AbortSignal) =>
    apiFetch<ScorerResponse>(`/api/matches/${matchId}/scorer`, { token, signal }),

  /** Record a delivery. Returns the replayed state — never patch locally. */
  postBall: async (token: string, matchId: string, ball: BallEventInput): Promise<MatchState> => {
    const result = await apiFetch<BallResponse>(`/api/matches/${matchId}/ball`, {
      method: 'POST',
      body: ball,
      token,
    });
    return result.state as MatchState;
  },

  /**
   * Correct a delivery that is **not** the last one.
   *
   * Undo only ever reached the tail, so fixing the third ball of an over
   * meant undoing four and re-entering them from memory, mid-match, with
   * people waiting. This replaces one delivery and the server replays the
   * rest of the innings around it.
   *
   * `changes` is the part that matters on screen: a correction is not local —
   * one run instead of two rotates the strike, so later deliveries were faced
   * by the other batter — and a card that silently rearranges itself is
   * indistinguishable from a bug. Show them before saying it worked.
   */
  correctBall: async (
    token: string,
    matchId: string,
    ballId: string,
    ball: PatchBallInput,
  ): Promise<{ state: MatchState; changes: BallCorrectionChange[]; rewritten: number }> => {
    const result = await apiFetch<BallCorrectionResponse>(
      `/api/matches/${matchId}/ball/${ballId}`,
      { method: 'PATCH', body: ball, token },
    );
    return {
      state: result.state as MatchState,
      changes: result.changes,
      rewritten: result.rewritten,
    };
  },

  /** Undo the last delivery. The engine drops the event and replays. */
  undoBall: async (token: string, matchId: string): Promise<MatchState> => {
    const result = await apiFetch<BallResponse>(`/api/matches/${matchId}/ball`, {
      method: 'DELETE',
      token,
    });
    return result.state as MatchState;
  },

  /**
   * Open the next innings — the chase, or a Super Over once the scores are
   * level. Which one it is is the server's to decide from what has been
   * played, so this call is the same either way.
   */
  startNextInnings: (token: string, matchId: string, body: StartNextInningsInput) =>
    apiFetch<unknown>(`/api/matches/${matchId}/innings`, { method: 'POST', body, token }),

  endInnings: (token: string, matchId: string) =>
    apiFetch<unknown>(`/api/matches/${matchId}/innings/end`, { method: 'POST', token }),

  /** Correct the title, venue, format or innings length. */
  updateMatch: (token: string, matchId: string, body: UpdateMatchInput) =>
    apiFetch<{ match: MatchSummary }>(`/api/matches/${matchId}`, { method: 'PATCH', body, token }),

  /**
   * Rain, a dispute, or a match started by mistake.
   *
   * Recorded as a no result rather than faked as a tie, and it is the only way
   * a live match becomes deletable — deletion refuses while one is in play.
   */
  abandonMatch: (token: string, matchId: string, reason?: string) =>
    apiFetch<{ match: MatchSummary }>(`/api/matches/${matchId}/abandon`, {
      method: 'POST',
      body: { reason },
      token,
    }),

  deleteMatch: (token: string, matchId: string) =>
    apiFetch<{ deleted: boolean }>(`/api/matches/${matchId}`, { method: 'DELETE', token }),

  /**
   * Both innings folded into a result. The scorer endpoint replays only the
   * innings in progress, so this is the only call that can describe a match
   * that is over.
   */
  matchSummary: (token: string | null, matchId: string, signal?: AbortSignal) =>
    apiFetch<MatchResultResponse>(`/api/matches/${matchId}/summary`, { token, signal }),

  /**
   * The full record — both innings, both tables, every delivery.
   *
   * The heavy one. The card screen fetches it once and switches tabs against
   * what it already has rather than going back to the network per view.
   */
  matchCard: (token: string | null, matchId: string, signal?: AbortSignal) =>
    apiFetch<MatchCardResponse>(`/api/matches/${matchId}/card`, { token, signal }),

  /**
   * Career context for a list of players, in one request.
   *
   * The pickers call this once with a whole squad rather than hitting
   * `playerStats` per row — twenty-two round trips on a screen someone is
   * trying to get past.
   */
  playerBriefs: (token: string, playerIds: string[], signal?: AbortSignal) =>
    apiFetch<PlayerBriefsResponse>(`/api/players/briefs?ids=${playerIds.join(',')}`, {
      token,
      signal,
    }),

  /** A club's public home — squad, recent results, and who leads it. */
  club: (token: string | null, teamId: string, signal?: AbortSignal) =>
    apiFetch<ClubPageResponse>(`/api/teams/${teamId}/club`, { token, signal }),
};
