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
  teamAId: string;
  teamBId: string;
  result: string | null;
  summary: string | null;
  startedAt: string | null;
  createdAt: string;
};

/** `GET /api/matches` */
export type MatchListResponse = {
  matches: MatchSummary[];
};

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
