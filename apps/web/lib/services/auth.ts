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
    .returning({ id: users.id, email: users.email, displayName: users.displayName });

  const user = inserted[0];
  if (!user) throw new Error('Could not create user');

  const { token, expiresAt } = await createSession(user.id, meta);
  return { token, expiresAt, user };
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

  // TODO: hash a dummy password when the user is missing, so a failed lookup
  // and a wrong password take comparable time. Currently a timing oracle.
  if (!user) throw invalid('Invalid email or password');

  const ok = await verifyPassword(input.password, user.passwordSalt, user.passwordHash);
  if (!ok) throw invalid('Invalid email or password');

  if (user.anonymisedAt) throw invalid('This account has been deleted');

  const { token, expiresAt } = await createSession(user.id, meta);
  return {
    token,
    expiresAt,
    user: { id: user.id, email: user.email, displayName: user.displayName },
  };
}
