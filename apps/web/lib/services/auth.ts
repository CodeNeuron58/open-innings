/**
 * Auth business logic, transport-free.
 *
 * These functions create the session row and hand back the raw token. They do
 * NOT set a cookie — the caller decides. The web action writes it to a cookie;
 * the REST handler returns it as JSON for native clients to store.
 */
import 'server-only';
import { eq } from 'drizzle-orm';
import type { SignupInput, LoginInput, AuthResponse } from '@open-innings/shared';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { hashPassword, verifyPassword, newSalt } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { conflict, invalid } from './errors';

export type SessionGrant = {
  token: string;
  expiresAt: Date;
  user: AuthResponse['user'];
};

export type RequestMeta = {
  userAgent?: string;
  ipAddress?: string;
};

/**
 * A fixed salt used only to burn the same time as a real password check.
 *
 * `verifyPassword` hashes the candidate and compares, so hashing it against
 * any salt and discarding the result costs exactly what a real verification
 * costs. There is no decoy hash to keep, nothing to compare against, and no
 * lazily-initialised state whose first call would be the slow one.
 *
 * Constant on purpose: this never protects anything, so it needs no entropy.
 */
const TIMING_SALT = '00112233445566778899aabbccddeeff';

/** Create an account and sign it in. Throws on a duplicate email. */
export async function registerUser(
  input: SignupInput,
  meta: RequestMeta = {},
): Promise<SessionGrant> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  // Checked up front for a friendlier message than a unique-constraint
  // violation. Racy in principle; the DB constraint is the real guard.
  if (existing.length > 0) {
    throw conflict('An account with that email already exists', 'email');
  }

  const salt = newSalt();
  const passwordHash = await hashPassword(input.password, salt);

  const inserted = await db
    .insert(users)
    .values({
      email: input.email,
      displayName: input.displayName ?? input.email.split('@')[0],
      passwordHash,
      passwordSalt: salt,
    })
    .returning({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      emailVerifiedAt: users.emailVerifiedAt,
    });

  const user = inserted[0];
  if (!user) throw new Error('Could not create user');

  const { token, expiresAt } = await createSession(user.id, meta);
  return {
    token,
    expiresAt,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      // Always null on a fresh account — nothing has been proven yet. Stated
      // rather than omitted so the client renders the prompt immediately.
      emailVerifiedAt: null,
    },
  };
}

/**
 * Verify credentials and open a session.
 *
 * Every failure returns the same message. Distinguishing "no such account"
 * from "wrong password" turns the login form into an account-enumeration
 * oracle.
 */
export async function authenticateUser(
  input: LoginInput,
  meta: RequestMeta = {},
): Promise<SessionGrant> {
  const rows = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  const user = rows[0];

  /*
   * Hash against a decoy when there is no such account.
   *
   * The uniform message above was defeated by the clock: a missing user
   * returned immediately while a real one waited for Argon2, and Argon2 is
   * deliberately slow. The gap is tens of milliseconds — trivially
   * measurable over a few requests — so the form answered "does this address
   * have an account here" to anyone who timed it, which is precisely what the
   * shared message exists to refuse.
   *
   * The result is discarded. The work is the point.
   */
  if (!user) {
    await hashPassword(input.password, TIMING_SALT);
    throw invalid('Invalid email or password');
  }

  const ok = await verifyPassword(input.password, user.passwordSalt, user.passwordHash);
  if (!ok) throw invalid('Invalid email or password');

  if (user.anonymisedAt) throw invalid('This account has been deleted');

  const { token, expiresAt } = await createSession(user.id, meta);
  return {
    token,
    expiresAt,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      // Serialised here, not by the route: `AuthResponse` is the wire
      // contract and it says string, so a Date leaking through would only be
      // caught by whichever client happened to parse it first.
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    },
  };
}
