/**
 * GET /api/auth/session — who am I?
 *
 * Native clients call this on launch to decide between the signed-in shell and
 * the login screen. Returns `{ user: null }` with a 200 rather than a 401:
 * "nobody is signed in" is a successful answer to the question asked.
 */
import { NextResponse } from 'next/server';
import { canSendMail } from '@/lib/services/account';
import { HTTP, type SessionResponse } from '@open-innings/shared';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { players } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/local';
import { handle } from '@/lib/api/respond';

export const GET = handle(async () => {
  const user = await getCurrentUser();

  /*
   * Which player on the field this account is, if it has said.
   *
   * Sent with the session rather than fetched separately because every screen
   * that needs it needs it immediately — "my career" is a navigation target,
   * and a tab that has to wait on a request before it knows where it goes is
   * a tab that flickers.
   */
  const claimed = user
    ? await db.select({ id: players.id }).from(players).where(eq(players.userId, user.id)).limit(1)
    : [];

  const body: SessionResponse = {
    user: user
      ? {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        }
      : null,
    // So a client never offers "resend confirmation" as a button that cannot
    // work — which is worse than not offering it.
    mailConfigured: canSendMail(),
    playerId: claimed[0]?.id ?? null,
  };

  return NextResponse.json(body, { status: HTTP.ok });
});
