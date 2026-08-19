/**
 * DELETE /api/me — delete your own account.
 * Requires password in the body since this action cannot be undone.
 */
import { NextResponse } from 'next/server';
import { deleteAccountSchema, HTTP } from '@open-innings/shared';
import { deleteOwnAccount } from '@/lib/services/deletion';
import { readJson, handle } from '@/lib/api/respond';
import { requireUserId } from '@/lib/auth/local';
import { enforceRateLimit } from '@/lib/api/request-meta';
import { sessionCookie } from '@/lib/api/request-meta';

export const DELETE = handle(async (request: Request) => {
  // Auth before the schema, so an anonymous caller gets 401 rather than
  // feedback describing the shape of the request.
  const userId = await requireUserId('Sign in to delete your account');

  // A wrong password here is a guess at a live account, and the endpoint
  // behind it is destructive. Tighter than login for that reason.
  enforceRateLimit(request, 'delete-account', { max: 5, windowMs: 60 * 60_000, identity: userId });

  const { password } = await readJson(request, deleteAccountSchema);
  const report = await deleteOwnAccount(userId, password);

  const response = NextResponse.json(
    {
      deleted: true,
      // Said back, because the trade is the part people need to understand:
      // the person is gone and the cricket stays. A screen that just says
      // "account deleted" leaves somebody wondering what happened to their
      // club's season.
      kept: report,
    },
    { status: HTTP.ok },
  );

  // The session rows are already gone. This clears the browser's copy so a
  // cookie for a destroyed session is not left lying around to be sent on
  // every subsequent request.
  response.cookies.set(sessionCookie('', new Date(0)));
  return response;
});
