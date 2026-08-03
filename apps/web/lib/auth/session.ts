/**
 * Open Innings — session management.
 *
 * Sessions are server-side: a random opaque token lives in a Postgres table,
 * bound to a user. The cookie stores the raw token; the DB stores SHA-256(token)
 * so a leaked DB dump doesn't yield usable credentials.
 *
 * Sessions expire after 30 days of inactivity. Refreshing on each request
 * (via middleware) gives a sliding window without forcing re-login.
 */
import { createHash, randomBytes } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sessions, users, type User } from '@/lib/db/schema';

export const SESSION_COOKIE = 'oi_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * How far the expiry must have drifted before a read bothers to extend it.
 *
 * The sliding window used to be refreshed on *every* lookup, which made every
 * authenticated read a write. The ownership scoping in lib/db/queries calls
 * `getUserId()` per query, so one dashboard render issued three UPDATEs
 * against the same row — concurrently, so they contended on its lock too. A
 * mobile client polling a live match would do that every few seconds.
 *
 * A day of granularity is invisible against a 30-day window: the session still
 * slides, it just stops rewriting a row to move an expiry by milliseconds.
 */
const SESSION_REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 1 day

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Pull the session token out of an `Authorization: Bearer <token>` header.
 *
 * Native clients can't use cookies, so they send the same opaque token this
 * module already issues — there is no second credential type, just a second
 * transport. Returns undefined if the header is absent or malformed.
 *
 * Takes anything header-shaped so it works with both a `Request.headers` and
 * the `headers()` object from `next/headers`.
 */
export function readBearerToken(headers: { get(name: string): string | null }): string | undefined {
  const header = headers.get('authorization');
  if (!header) return undefined;

  const [scheme, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return undefined;

  const token = rest.join(' ').trim();
  return token.length > 0 ? token : undefined;
}

/**
 * Create a new session for `userId`. Returns the raw token — store this in
 * the cookie. The DB stores the SHA-256 hash, never the raw token.
 */
export async function createSession(
  userId: string,
  meta?: { userAgent?: string; ipAddress?: string },
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    userId,
    tokenHash,
    userAgent: meta?.userAgent,
    ipAddress: meta?.ipAddress,
    expiresAt,
  });

  // Opportunistic sweep. Expired rows are otherwise only removed when someone
  // happens to present one, so a user who signs in on a new device every month
  // and never returns to the old one leaves those rows forever.
  //
  // Hooked to session creation rather than a cron because it needs no
  // infrastructure and logins are rare enough that an indexed DELETE here is
  // free. Deliberately not awaited — a slow sweep must never delay a sign-in.
  void purgeExpiredSessions();

  return { token, expiresAt };
}

/**
 * Delete every session past its expiry.
 *
 * Uses the `sessions_expires_idx` index. Safe to call concurrently and safe to
 * call often; it only ever removes rows `getUserFromToken` would have rejected.
 */
export async function purgeExpiredSessions(): Promise<void> {
  try {
    await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  } catch (error) {
    // Housekeeping must never break the request that triggered it.
    console.error('[session] failed to purge expired sessions', error);
  }
}

/**
 * Look up the user behind a session token. Validates expiry and updates the
 * `expiresAt` (sliding window). Returns null if the token is unknown,
 * expired, or the user was anonymised.
 */
export async function getUserFromToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;

  const tokenHash = sha256(token);
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (row.session.expiresAt.getTime() < Date.now()) {
    // Expired — clean up and reject.
    await db.delete(sessions).where(eq(sessions.id, row.session.id));
    return null;
  }

  if (row.user.anonymisedAt) {
    // User requested deletion. Treat as logged out.
    return null;
  }

  // Sliding window, but only when the expiry has actually drifted — see
  // SESSION_REFRESH_THRESHOLD_MS. Most reads skip the write entirely.
  const target = Date.now() + SESSION_TTL_MS;
  if (target - row.session.expiresAt.getTime() > SESSION_REFRESH_THRESHOLD_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(target) })
      .where(eq(sessions.id, row.session.id));
  }

  return row.user;
}

/**
 * Delete the session behind `token` (sign-out). Idempotent — safe to call
 * with an unknown token.
 */
export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = sha256(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}
