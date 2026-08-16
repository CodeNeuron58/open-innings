/**
 * Which player on the field is this account?
 *
 * `players.user_id` has existed since the first schema and nothing ever set
 * it, which is why "my career" had nowhere to point, A5's profile fields had
 * nowhere to save, and E3's invite-by-number had nothing to invite someone
 * into.
 *
 * The distinction is real and worth keeping: an **account** is whoever is
 * doing the scoring, and a **player** is somebody who batted. Most scorers
 * are both, some are neither — a parent scoring their kid's match is an
 * account with no player, and every opponent is a player with no account.
 * Joining them is a claim someone makes, not a fact the system assumes.
 *
 * PUT   — claim a player as yourself.
 * DELETE — stop being that player.
 */
import { NextResponse } from 'next/server';
import { and, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { HTTP } from '@open-innings/shared';
import { db } from '@/lib/db/client';
import { players } from '@/lib/db/schema';
import { requireUserId } from '@/lib/auth/local';
import { handle, readJson } from '@/lib/api/respond';
import { invalid } from '@/lib/services/errors';

const bodySchema = z.object({ playerId: z.string().trim().min(1) });

export const PUT = handle(async (request: Request) => {
  const userId = await requireUserId('Sign in to claim a player');
  const { playerId } = await readJson(request, bodySchema);

  /*
   * One transaction, because it is two writes that must not half-happen:
   * release whatever this account currently claims, then claim the new one.
   * Interrupted between them, an account would point at nobody.
   */
  await db.transaction(async (tx) => {
    /*
     * Only a player you created, and only one nobody else has claimed.
     *
     * Without the first condition anyone could claim any player in the
     * database and inherit their career. Without the second, two accounts
     * could both insist they are the same person and the last write would
     * win silently.
     *
     * Re-claiming your own player is allowed so a double tap is a no-op.
     */
    const [target] = await tx
      .select({ id: players.id })
      .from(players)
      .where(
        and(
          eq(players.id, playerId),
          eq(players.createdBy, userId),
          or(isNull(players.userId), eq(players.userId, userId)),
        ),
      )
      .limit(1);

    if (!target) {
      // One message for "does not exist", "not yours" and "already someone
      // else's". Distinguishing them would let anyone probe which player ids
      // are already claimed.
      throw invalid('That player cannot be claimed.', 'playerId');
    }

    // At most one player per account: claiming a second releases the first,
    // rather than leaving an account pointing at two careers.
    await tx
      .update(players)
      .set({ userId: null, updatedAt: new Date() })
      .where(eq(players.userId, userId));
    await tx.update(players).set({ userId, updatedAt: new Date() }).where(eq(players.id, playerId));
  });

  return NextResponse.json({ playerId }, { status: HTTP.ok });
});

export const DELETE = handle(async () => {
  const userId = await requireUserId();

  await db
    .update(players)
    .set({ userId: null, updatedAt: new Date() })
    .where(eq(players.userId, userId));

  return NextResponse.json({ playerId: null }, { status: HTTP.ok });
});
