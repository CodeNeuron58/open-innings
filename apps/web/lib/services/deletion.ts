/**
 * Deleting an account (anonymising it).
 *
 * The user row survives to preserve match history for other players, but is
 * stripped of all identifying information. Credentials are scrambled to make
 * the account permanently inaccessible.
 */
import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { notifySignups, players, sessions, users, verificationTokens } from '@/lib/db/schema';
import { hashPassword, newSalt, verifyPassword } from '@/lib/auth/password';
import { invalid, notFound } from './errors';

export type DeletionReport = {
  /** Kept, because they are other people's cricket as much as yours. */
  matchesKept: number;
  /** Squads that stay, now owned by a row that names nobody. */
  teamsKept: number;
  /** A claimed player is released — the person stays, the link goes. */
  playerReleased: boolean;
};

/**
 * Anonymise an account after checking the password.
 *
 * The password is re-checked rather than trusting the session: a session
 * proves who signed in, not who is holding the phone now, and this is the one
 * action in the app that cannot be undone.
 */
export async function deleteOwnAccount(userId: string, password: string): Promise<DeletionReport> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.anonymisedAt) throw notFound('Account not found');

  const ok = await verifyPassword(password, user.passwordSalt, user.passwordHash);
  if (!ok) throw invalid('That password is not right', 'password');

  /*
   * A reserved domain, and the id inside it.
   *
   * `.invalid` is set aside by RFC 2606 and can never be registered, so this
   * address cannot be delivered to and cannot collide with a real one. The id
   * keeps the column's unique constraint satisfied without needing a lookup,
   * and lets an operator match a row to a deletion request without storing
   * anything about who made it.
   */
  const deletedEmail = `deleted-${user.id}@deleted.invalid`;

  // Random credentials, thrown away immediately. Nothing will ever verify
  // against them, which is the point: the account is unusable even if a
  // future read path forgets to check `anonymisedAt`.
  const deadSalt = newSalt();
  const deadHash = await hashPassword(newSalt() + newSalt(), deadSalt);

  return db.transaction(async (tx) => {
    // Counted before the row is stripped, so the report can say what survived.
    // Not for bookkeeping — for the confirmation screen, where "your 12
    // matches stay" is the sentence that makes the trade understandable.
    const [teams, matches] = await Promise.all([
      tx.execute<{ n: number }>(
        sql`select count(*)::int as n from teams where owner_id = ${userId}::uuid`,
      ),
      tx.execute<{ n: number }>(
        sql`select count(*)::int as n from matches where created_by = ${userId}::uuid`,
      ),
    ]);

    // The claim on a player, released. The player stays — they are a
    // cricketer other people have scored, not a property of this account.
    const released = await tx
      .update(players)
      .set({ userId: null })
      .where(eq(players.userId, userId))
      .returning({ id: players.id });

    await tx
      .update(users)
      .set({
        email: deletedEmail,
        displayName: null,
        avatarUrl: null,
        bio: null,
        // Freed rather than kept: a number nobody can sign in with is a
        // number that should be available to whoever holds it next.
        phone: null,
        phoneVerifiedAt: null,
        emailVerifiedAt: null,
        passwordHash: deadHash,
        passwordSalt: deadSalt,
        anonymisedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Every device signed out, and any confirmation or reset in flight
    // destroyed. A live reset link outliving the account it belongs to would
    // be a way back into a deleted account.
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(verificationTokens).where(eq(verificationTokens.userId, userId));

    // The release-notification list is a separate store of the same address,
    // and it is easy to forget precisely because it is not joined to anything.
    await tx.delete(notifySignups).where(eq(notifySignups.email, user.email));

    return {
      matchesKept: matches[0]?.n ?? 0,
      teamsKept: teams[0]?.n ?? 0,
      playerReleased: released.length > 0,
    };
  });
}
