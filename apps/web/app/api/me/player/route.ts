/**
 * PUT    /api/me/player — claim a player profile as yourself.
 * DELETE /api/me/player — release the claimed profile.
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

  // Transaction: release current claim and set new claim atomically.
  await db.transaction(async (tx) => {
    // You can only claim a player you created that nobody else has claimed.
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
      // Generic message prevents probing claimed player IDs.
      throw invalid('That player cannot be claimed.', 'playerId');
    }

    // Release existing claim before setting the new one.
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
