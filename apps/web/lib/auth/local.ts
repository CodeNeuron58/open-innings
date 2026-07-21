/**
 * Open Innings — local auth (email + password).
 *
 * Drop-in replacement for the previous Supabase-based `getSupabaseServerClient`.
 * Reads the session cookie, looks up the user, returns the user (or null).
 *
 * For DB queries that need a "current user id", use `getUserId()`.
 */
import { cookies } from 'next/headers';
import { SESSION_COOKIE, getUserFromToken } from '@/lib/auth/session';
import type { User } from '@/lib/db/schema';

/**
 * Get the user behind the current request's session cookie.
 * Returns null if not signed in or session is invalid.
 *
 * Use in server components, route handlers, and server actions.
 */
export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return getUserFromToken(token);
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
