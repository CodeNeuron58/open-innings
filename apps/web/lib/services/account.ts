/**
 * Confirming an address, and recovering an account. Transport-free.
 *
 * ## The one rule that shapes all of this
 *
 * **Nothing here may reveal whether an address has an account.** A signup form
 * already discloses that — it has to, it cannot let you take a taken address —
 * but a *reset* form must not, because it is unauthenticated and anyone can
 * type anything into it. So requesting a reset returns the same answer for an
 * address that exists and one that does not, takes broadly the same time, and
 * the difference is only ever visible in the inbox of whoever owns it.
 *
 * That is why `requestPasswordReset` returns nothing at all rather than a
 * boolean the route might be tempted to branch on.
 */
import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { hashPassword, newSalt } from '@/lib/auth/password';
import {
  TTL,
  applyPasswordReset,
  consumeToken,
  issueToken,
  markEmailVerified,
  purgeStaleTokens,
} from '@/lib/auth/verification';
import { send, mailConfigured } from '@/lib/mail/send';
import { resetPassword, verifyEmail } from '@/lib/mail/templates';
import { invalid } from './errors';

/**
 * Where links in mail point.
 *
 * Read at call time, not at module load. `APP_URL` is a Heroku config var, and
 * reading it into a module constant would bake whatever was set at build time
 * into every link — which on this project has already happened once, with
 * `NEXT_PUBLIC_*` inlined into a bundle.
 */
function appUrl(): string {
  return (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

/** True when a confirmation could actually be delivered. Surfaced to clients. */
export function canSendMail(): boolean {
  return mailConfigured;
}

/**
 * Send a confirmation link. Safe to call for an already-verified account.
 *
 * Fire-and-forget by design: the caller is usually signup, and a mail provider
 * having a bad afternoon must not stop somebody opening an account at a
 * ground. The result is returned for callers that want to say "check your
 * inbox" only when it is true.
 */
export async function sendVerificationEmail(userId: string): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.anonymisedAt) return false;
  // Already proven. Re-sending would be a link that confirms nothing.
  if (user.emailVerifiedAt) return false;

  void purgeStaleTokens();

  const token = await issueToken(user.id, 'email_verify', user.email);
  const link = `${appUrl()}/verify?token=${encodeURIComponent(token)}`;
  const result = await send({
    to: user.email,
    ...verifyEmail(link, TTL.email_verify / 3_600_000),
  });
  return result.ok;
}

export type VerifyOutcome = 'verified' | 'already' | 'expired' | 'invalid';

/** Spend a confirmation link. */
export async function confirmEmail(token: string): Promise<VerifyOutcome> {
  const result = await consumeToken(token, 'email_verify');
  if (!result.ok) {
    // "Used" is reported as success. The person following a link a second
    // time — or whose mail client scanned it first — has done the thing being
    // asked of them, and telling them it failed would be both wrong and
    // alarming.
    if (result.reason === 'used') return 'already';
    return result.reason === 'expired' ? 'expired' : 'invalid';
  }

  await markEmailVerified(result.userId, result.sentTo);
  return 'verified';
}

/**
 * Ask for a reset link.
 *
 * Returns nothing, on purpose. There is no outcome the caller is entitled to
 * branch on: an unknown address and a known one must produce the same
 * response, or the form becomes a way to test whether somebody has an account
 * here.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // No account, or a deleted one. Silence, and the caller says the same thing
  // it would have said anyway.
  if (!user || user.anonymisedAt) return;

  void purgeStaleTokens();

  const token = await issueToken(user.id, 'password_reset', user.email);
  const link = `${appUrl()}/reset?token=${encodeURIComponent(token)}`;
  await send({
    to: user.email,
    ...resetPassword(link, TTL.password_reset / 60_000),
  });
}

/**
 * Spend a reset link and set the new password.
 *
 * Throws rather than returning a reason, because unlike the confirmation
 * flow there is exactly one useful thing to tell somebody whose link did not
 * work: ask for another. The distinction between expired and already-used is
 * kept in the message only because the next step genuinely differs.
 */
export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  const result = await consumeToken(token, 'password_reset');

  if (!result.ok) {
    throw invalid(
      result.reason === 'expired'
        ? 'That reset link has expired. Ask for a new one.'
        : result.reason === 'used'
          ? 'That reset link has already been used. Ask for a new one if you still need it.'
          : 'That reset link is not valid. Ask for a new one.',
      'token',
    );
  }

  const salt = newSalt();
  const passwordHash = await hashPassword(password, salt);
  await applyPasswordReset(result.userId, result.sentTo, passwordHash, salt);
}
