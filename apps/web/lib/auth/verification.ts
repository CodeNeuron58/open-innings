/**
 * Single-use secrets for confirming addresses and resetting passwords.
 *
 * Secrets are hashed at rest, single-use, invalidate previous tokens,
 * and consuming a password reset kills all active sessions.
 */
import 'server-only';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { hashPassword, newSalt, verifyPassword } from '@/lib/auth/password';
import { sessions, users, verificationTokens } from '@/lib/db/schema';

/**
 * How long each kind of secret lives.
 * Password resets are short for security; email confirmations are longer.
 */
export const TTL = {
  /* 10 minutes because a 6-digit code is guessable over long periods. */
  email_verify: 10 * 60 * 1000, // 10 minutes
  password_reset: 60 * 60 * 1000, // 60 minutes
} as const;

/**
 * Wrong guesses before a code is destroyed (stored in DB to survive restarts).
 * Limits guessing attacks on 6-digit codes.
 */
export const MAX_CODE_ATTEMPTS = 5;

/** Six digits, from the CSPRNG. */
const CODE_DIGITS = 6;

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
 * Issue a single-use secret and return the raw value to be mailed.
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

/**
 * Issue a securely generated 6-digit code and return it in the clear.
 * Hashed with Argon2 to protect against brute-force on leaked DB rows.
 */
export async function issueCode(userId: string, purpose: Purpose, sentTo: string): Promise<string> {
  // 0..999999 padded, so `007421` is as likely as `907421`. Slicing a random
  // string or taking a modulus of a larger range are the two ways this
  // usually ends up non-uniform.
  const code = String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0');
  const salt = newSalt();
  const codeHash = await hashPassword(code, salt);
  const expiresAt = new Date(Date.now() + TTL[purpose]);

  await db.transaction(async (tx) => {
    // A new code retires the old one. Two live codes means two ways in, and
    // the person is looking at the newest message anyway.
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
      tokenHash: codeHash,
      codeSalt: salt,
      sentTo,
      expiresAt,
    });
  });

  return code;
}

export type CodeResult =
  | { ok: true; sentTo: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'none'; attemptsLeft: number };

/**
 * Check a code against the live one for this account.
 * Deducts attempts on failure and destroys the code after MAX_CODE_ATTEMPTS.
 */
export async function consumeCode(
  userId: string,
  purpose: Purpose,
  code: string,
): Promise<CodeResult> {
  const row = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.userId, userId),
          eq(verificationTokens.purpose, purpose),
          isNull(verificationTokens.usedAt),
          gt(verificationTokens.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(verificationTokens.createdAt))
      .limit(1)
      .for('update');

    const found = rows[0];
    if (!found) return null;

    // Counted before the comparison, and committed either way. Incrementing
    // afterwards would let an attacker abandon the request the moment a guess
    // looked slow and never pay for it.
    await tx
      .update(verificationTokens)
      .set({ attempts: found.attempts + 1 })
      .where(eq(verificationTokens.id, found.id));

    return { ...found, attempts: found.attempts + 1 };
  });

  if (!row) return { ok: false, reason: 'none', attemptsLeft: 0 };

  const correct =
    row.codeSalt !== null && (await verifyPassword(code, row.codeSalt, row.tokenHash));

  if (correct) {
    await db
      .update(verificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(verificationTokens.id, row.id));
    return { ok: true, sentTo: row.sentTo };
  }

  const attemptsLeft = Math.max(0, MAX_CODE_ATTEMPTS - row.attempts);
  if (attemptsLeft === 0) {
    // Spent, not merely refused. The next step has to be a fresh message.
    await db
      .update(verificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(verificationTokens.id, row.id));
  }

  return { ok: false, reason: 'invalid', attemptsLeft };
}

export type ConsumeResult =
  | { ok: true; userId: string; sentTo: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' };

/**
 * Spend a secret, once.
 * Returns distinct error reasons to guide the user without leaking info.
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
 * Set a new password, end all active sessions, and mark email as verified.
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
 * Opportunistically delete spent and expired tokens.
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
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
