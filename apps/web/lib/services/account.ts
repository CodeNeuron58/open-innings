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
  MAX_CODE_ATTEMPTS,
  TTL,
  applyPasswordReset,
  consumeCode,
  consumeToken,
  issueCode,
  issueToken,
  markEmailVerified,
  purgeStaleTokens,
} from '@/lib/auth/verification';
import { send, mailConfigured } from '@/lib/mail/send';
import { resetPassword, verifyCode } from '@/lib/mail/templates';
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

  const code = await issueCode(user.id, 'email_verify', user.email);
  const result = await send({
    to: user.email,
    ...verifyCode(code, TTL.email_verify / 60_000),
  });
  return result.ok;
}

export type VerifyOutcome =
  | { kind: 'verified' }
  | { kind: 'already' }
  /** No live code — never asked, expired, or burnt through its attempts. */
  | { kind: 'none' }
  | { kind: 'wrong'; attemptsLeft: number };

/**
 * Check the six digits somebody typed.
 *
 * Scoped to the signed-in account rather than looked up by the code, which is
 * what keeps six digits safe: a guesser has to already be signed in as the
 * person whose address they are trying to prove, and their five attempts are
 * counted against that one account.
 *
 * An account that is already verified short-circuits. Somebody re-entering an
 * old code has done nothing wrong and should not be told they failed.
 */
export async function confirmEmailCode(userId: string, code: string): Promise<VerifyOutcome> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { kind: 'none' };
  if (user.emailVerifiedAt) return { kind: 'already' };

  const result = await consumeCode(userId, 'email_verify', code);
  if (result.ok) {
    await markEmailVerified(userId, result.sentTo);
    return { kind: 'verified' };
  }

  if (result.reason === 'none') return { kind: 'none' };
  return { kind: 'wrong', attemptsLeft: result.attemptsLeft };
}

export { MAX_CODE_ATTEMPTS };

/**
 * Ask for a reset link.
 *
 * Returns nothing, on purpose. There is no outcome the caller is entitled to
 * branch on: an unknown address and a known one must produce the same
 * response, or the form becomes a way to test whether somebody has an account
 * here.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);

  // No account, or a deleted one. Silence, and the caller says the same thing
  // it would have said anyway.
  if (!user || user.anonymisedAt) return;

  void purgeStaleTokens();

  /*
   * The token is issued synchronously; only the mail is detached.
   *
   * The body was already constant for both outcomes. The *timing* was not: an
   * unknown address cost one SELECT, a known one cost a SELECT plus a write
   * transaction plus an **awaited HTTPS round trip to Resend**. That last term
   * is the whole oracle — hundreds of milliseconds against the ~50ms Argon2
   * gap `authenticateUser` goes out of its way to close with a fixed salt.
   *
   * Detaching the *whole* tail closed it completely and bought a race: the row
   * did not exist when this returned, so anything reading straight back saw
   * nothing. The smoke suite does exactly that and started failing
   * intermittently — passing on one run and not the next, which is worse than
   * a clean break because CI would have blamed something else.
   *
   * So the write is awaited and the network call is not. What remains is one
   * SELECT versus a SELECT plus a local write — single-digit milliseconds,
   * smaller than the Argon2 gap this codebase already accepts, and without a
   * remote round trip standing on top of it.
   */
  const token = await issueToken(user.id, 'password_reset', user.email);
  const link = `${appUrl()}/reset?token=${encodeURIComponent(token)}`;

  // `send` is documented never to throw; the catch is here so a change to that
  // cannot become an unhandled rejection nobody sees.
  void send({ to: user.email, ...resetPassword(link, TTL.password_reset / 60_000) }).catch(
    (error: unknown) => console.error('[reset] could not send the reset mail', error),
  );
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
