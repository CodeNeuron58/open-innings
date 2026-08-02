/**
 * GET /api/auth/session — who am I?
 *
 * Native clients call this on launch to decide between the signed-in shell and
 * the login screen. Returns `{ user: null }` with a 200 rather than a 401:
 * "nobody is signed in" is a successful answer to the question asked.
 */
import { NextResponse } from 'next/server';
import { HTTP, type SessionResponse } from '@open-innings/shared';
import { getCurrentUser } from '@/lib/auth/local';
import { handle } from '@/lib/api/respond';

export const GET = handle(async () => {
  const user = await getCurrentUser();

  const body: SessionResponse = {
    user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null,
  };

  return NextResponse.json(body, { status: HTTP.ok });
});
