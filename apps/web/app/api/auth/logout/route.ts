/**
 * POST /api/auth/logout — destroy the current session.
 *
 * Deletes the session row, so the token dies for whichever transport
 * presented it. Idempotent: logging out twice is not an error.
 */
import { NextResponse } from 'next/server';
import { HTTP } from '@open-innings/shared';
import { SESSION_COOKIE, destroySession } from '@/lib/auth/session';
import { getSessionToken } from '@/lib/auth/local';
import { handle } from '@/lib/api/respond';

export const POST = handle(async () => {
  const token = await getSessionToken();
  await destroySession(token);

  const response = NextResponse.json({ ok: true }, { status: HTTP.ok });
  response.cookies.delete(SESSION_COOKIE);
  return response;
});
