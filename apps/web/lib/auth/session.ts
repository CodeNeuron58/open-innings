/**
 * Server-side session management.
 *
 * DB stores SHA-256(token) bound to a user with a 30-day sliding window expiry.
 */
import { createHash, randomBytes } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sessions, users, type User } from '@/lib/db/schema';

export const SESSION_COOKIE = 'oi_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * How far the expiry must have drifted before extending it.
 * Prevents every read from becoming a write, avoiding lock contention.
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
 * Works with both `Request.headers` and `headers()` from `next/headers`.
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

  // Opportunistic sweep hooked to session creation.
  // Deliberately not awaited — a slow sweep must never delay a sign-in.
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
