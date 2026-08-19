/**
 * Resolving "who is asking?" on the server.
 * Supports both web sessions (cookies) and native clients (Authorization header).
 */
import { cookies, headers } from 'next/headers';
import { SESSION_COOKIE, getUserFromToken, readBearerToken } from '@/lib/auth/session';
import type { User } from '@/lib/db/schema';
import { unauthorized } from '@/lib/services/errors';

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
 * The user id, or a 401 — for handlers that write.
 *
 * Call this **before** parsing the body. Services check auth too, so nothing
 * was ever created anonymously without it — but validating first means an
 * unauthenticated caller gets a 400 describing the schema instead of a 401,
 * which both leaks the shape of a request they may not make and answers a
 * different question than the one they asked.
 *
 * It also makes the check impossible to forget by reading the handler: a
 * mutating route that does not open with this line is visibly missing one.
 */
export async function requireUserId(message = 'Sign in to continue'): Promise<string> {
  const userId = await getUserId();
  if (!userId) throw unauthorized(message);
  return userId;
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
