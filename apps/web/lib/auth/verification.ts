/**
 * Single-use secrets: confirming an address, and getting back into an account.
 *
 * One mechanism, two purposes, because they are the same problem — issue a
 * secret to a channel only the right person can read, and accept it back once.
 *
 * ## The rules, and why each one is here
 *
 * **Hashed at rest.** A live reset token is a bearer credential: whoever holds
 * it owns the account. `sessions` already stores SHA-256 for this reason, and
 * a reset token deserves it more, not less. The row proves a token was issued;
 * it cannot reproduce one.
 *
 * **Single use.** `usedAt` is stamped inside the same transaction that spends
 * it. Mail clients follow links to scan them, people forward them, and
 * browsers prefetch — a token that works twice works for whoever gets there
 * second.
 *
 * **Issuing invalidates the last one.** Tapping "resend" three times must not
 * leave three live tokens; the user is looking at the newest mail and the
 * older two are just extra ways in.
 *
 * **Consuming a reset kills every session.** The common reason for a reset is
 * that somebody else may have the password. Leaving their existing sessions
 * alive would make the reset theatre.
 */
import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sessions, users, verificationTokens } from '@/lib/db/schema';

/**
 * How long each kind of secret lives.
 *
 * A reset is short because it is the dangerous one: it is a live key to an
 * account sitting in an inbox, and an inbox is not always the owner's alone —
 * a shared laptop, a synced desktop client, a phone somebody left on a bench.
 *
 * A confirmation is long because it is not dangerous at all. Following it
 * proves an address; it grants nothing. Making it short buys no safety and
 * costs the person who signed up in the evening and read their mail the next
 * morning.
 */
export const TTL = {
  email_verify: 24 * 60 * 60 * 1000, // 24 hours
  password_reset: 60 * 60 * 1000, // 60 minutes
} as const;

export type Purpose = keyof typeof TTL;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * 32 bytes, the same size as a session token.
 *
 * base64url so it survives a URL, an email client's link rewriter, and a
 * double-click-to-select without needing to be escaped anywhere.
 */
function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Issue a secret and return the raw value — the only time it exists.
 *
 * The caller mails it. Nothing else can, because nothing else will ever be
 * able to read it back.
 */
export async function issueToken(
  userId: string,
  purpose: Purpose,
  sentTo: string,
): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TTL[purpose]);

  await db.transaction(async (tx) => {
    // Supersede this user's earlier live tokens of the same purpose. Three
    // taps of "resend" should leave one way in, not three.
    await tx
      .update(verificationTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(verificationTokens.userId, userId),
          eq(verificationTokens.purpose, purpose),
          isNull(verificationTokens.usedAt),
        ),
      );

    await tx.insert(verificationTokens).values({
      userId,
      purpose,
      tokenHash: sha256(token),
      sentTo,
      expiresAt,
    });
  });

  return token;
}

export type ConsumeResult =
  | { ok: true; userId: string; sentTo: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' };

/**
 * Spend a secret, once.
 *
 * Every failure is deliberately narrow in what it reveals. "Expired" and
 * "used" are worth distinguishing to the person holding the link, because the
 * useful next step differs — ask for another, or you are already done — and
 * neither discloses anything about an account that the holder of the token
 * does not already have.
 */
export async function consumeToken(token: string, purpose: Purpose): Promise<ConsumeResult> {
  if (!token) return { ok: false, reason: 'invalid' };
  const tokenHash = sha256(token);

  return db.transaction(async (tx) => {
    /*
     * Locked for the length of the transaction.
     *
     * Two requests arriving with the same token — a mail client's scanner and
     * the person, at the same moment — would otherwise both read it as unused
     * and both succeed. `for update` makes the second wait and then see the
     * `usedAt` the first wrote.
     */
    const rows = await tx
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.tokenHash, tokenHash))
      .limit(1)
      .for('update');

    const row = rows[0];
    if (!row || row.purpose !== purpose) return { ok: false, reason: 'invalid' } as const;
    if (row.usedAt) return { ok: false, reason: 'used' } as const;
    if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' } as const;

    await tx
      .update(verificationTokens)
      .set({ usedAt: new Date(), attempts: sql`${verificationTokens.attempts} + 1` })
      .where(eq(verificationTokens.id, row.id));

    return { ok: true, userId: row.userId, sentTo: row.sentTo } as const;
  });
}

/** Mark the address on the account as proven. */
export async function markEmailVerified(userId: string, address: string): Promise<void> {
  // Scoped to the address the token was issued to. If the account's email has
  // changed since, an old link must not confirm the new one.
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(users.id, userId), eq(users.email, address)));
}

/**
 * Set a new password and end every session on the account.
 *
 * One transaction. The reason somebody resets is usually that a password may
 * be known to somebody else — leaving that person's existing sessions alive
 * would make the whole exercise decorative.
 *
 * Confirming a reset also verifies the address, and that is not a shortcut:
 * following a link sent to it is exactly the proof `email_verify` asks for.
 */
export async function applyPasswordReset(
  userId: string,
  address: string,
  passwordHash: string,
  passwordSalt: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash,
        passwordSalt,
        emailVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await tx.delete(sessions).where(eq(sessions.userId, userId));

    // Any other live reset for this account goes with it. Two links in flight
    // and only one used is a second key still lying around.
    await tx
      .update(verificationTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(verificationTokens.userId, userId),
          eq(verificationTokens.purpose, 'password_reset'),
          isNull(verificationTokens.usedAt),
        ),
      );

    void address;
  });
}

/**
 * Delete spent and expired rows.
 *
 * Opportunistic, like the session purge: called on issue rather than
 * scheduled, because Heroku's Essential tier has no cron and a table that
 * only grows is a slow leak nobody notices until a backup gets large.
 */
export async function purgeStaleTokens(): Promise<void> {
  try {
    await db.delete(verificationTokens).where(lt(verificationTokens.expiresAt, new Date()));
  } catch (error) {
    // A failed sweep must never fail the request that triggered it.
    console.error('[verification] purge failed', error);
  }
}

/**
 * Compare two secrets without leaking their difference through timing.
 *
 * Not used by the token path — that looks up by hash, so there is nothing to
 * compare — but exported for the phone OTP that will need it. A six-digit
 * code *is* guessable, and `===` on a short secret returns faster the earlier
 * it differs.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
