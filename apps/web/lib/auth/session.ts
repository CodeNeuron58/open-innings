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
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sessions, users, type User } from '@/lib/db/schema';

export const SESSION_COOKIE = 'oi_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
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

  return { token, expiresAt };
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

  // Sliding window: extend on every successful read.
  const newExpiry = new Date(Date.now() + SESSION_TTL_MS);
  await db
    .update(sessions)
    .set({ expiresAt: newExpiry })
    .where(eq(sessions.id, row.session.id));

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