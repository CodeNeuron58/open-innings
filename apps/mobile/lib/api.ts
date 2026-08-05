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
  type MatchDetailResponse,
  type CreateMatchInput,
  type CreateMatchResponse,
  type PlayerListResponse,
  type PlayerResponse,
  type CreatePlayerInput,
  type TeamListResponse,
  type TeamResponse,
  type TeamDetailResponse,
  type TeamMembersResponse,
  type CreateTeamInput,
  type ScorerResponse,
  type BallResponse,
  type StartSecondInningsInput,
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
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
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

  /** Undo the last delivery. The engine drops the event and replays. */
  undoBall: async (token: string, matchId: string): Promise<MatchState> => {
    const result = await apiFetch<BallResponse>(`/api/matches/${matchId}/ball`, {
      method: 'DELETE',
      token,
    });
    return result.state as MatchState;
  },

  startSecondInnings: (token: string, matchId: string, body: StartSecondInningsInput) =>
    apiFetch<unknown>(`/api/matches/${matchId}/innings`, { method: 'POST', body, token }),

  endInnings: (token: string, matchId: string) =>
    apiFetch<unknown>(`/api/matches/${matchId}/innings/end`, { method: 'POST', token }),
};
