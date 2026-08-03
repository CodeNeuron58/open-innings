/**
 * Open Innings — resolving "who is asking?" on the server.
 *
 * Two transports carry the same credential:
 *
 *   - the web sends the session cookie,
 *   - native clients send `Authorization: Bearer <token>`.
 *
 * Both are the same opaque token issued by `createSession`, so both resolve
 * through `getUserFromToken`. There is no separate mobile credential: revoking
 * a session logs the user out everywhere.
 *
 * Resolution lives here rather than in each route handler because the whole
 * query layer (`lib/db/queries`) calls `getUserId()` for its ownership scoping.
 * Teaching this one function about bearer tokens makes every existing query
 * work for mobile without touching a single call site.
 *
 * That does mean one request can resolve the session several times — a
 * dashboard listing matches, players and teams resolves it three times.
 *
 * Do not reach for React's `cache()` to fix that. It is the documented answer
 * for Server Components, but it is a **no-op in route handlers**: measured on
 * this codebase, two calls inside one handler both executed and the counter
 * rose by two on every request. (It doesn't leak between requests either, so
 * it's inert rather than dangerous — just useless here, and route handlers are
 * the entire mobile surface.)
 *
 * The cost that actually mattered was the write, not the read: the sliding
 * window used to UPDATE on every lookup. `session.ts` now only writes when the
 * expiry has genuinely drifted, so repeat lookups are cheap indexed SELECTs.
 * If those ever show up in a profile, the fix is AsyncLocalStorage, not
 * `cache()`.
 */
import { cookies, headers } from 'next/headers';
import { SESSION_COOKIE, getUserFromToken, readBearerToken } from '@/lib/auth/session';
import type { User } from '@/lib/db/schema';

/**
 * Get the user behind the current request, from either transport.
 * Returns null if not signed in or the session is invalid.
 *
 * Bearer wins when both are present: an explicit header is a deliberate act,
 * a cookie is ambient.
 *
 * Works in server components, route handlers, and server actions — `headers()`
 * and `cookies()` are both available in all three.
 */
export async function getCurrentUser(): Promise<User | null> {
  const hdrs = await headers();
  const bearer = readBearerToken(hdrs);
  if (bearer) return getUserFromToken(bearer);

  const cookieStore = await cookies();
  return getUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
}

/**
 * Shorthand for the common case: just give me the user id.
 * Returns null if not signed in. Use this everywhere a "who's asking?"
 * check is needed (creating matches, scoring balls, etc).
 */
export async function getUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

/**
 * The raw session token for the current request, whichever transport carried
 * it. Sign-out needs this to destroy the right row.
 */
export async function getSessionToken(): Promise<string | undefined> {
  const hdrs = await headers();
  const bearer = readBearerToken(hdrs);
  if (bearer) return bearer;

  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}
