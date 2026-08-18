/**
 * POST /api/auth/reset — ask for a reset link.
 * PUT  /api/auth/reset — spend one and set the new password.
 *
 * Both unauthenticated, necessarily: somebody who could sign in would not be
 * here.
 *
 * ## The response to POST never varies
 *
 * Same body, same status, whether or not the address has an account. A reset
 * form is the one place an attacker can type any address and read the answer,
 * so the answer must not contain one. The only place the difference is visible
 * is the inbox of whoever owns it.
 *
 * This is why the service returns `void` rather than a boolean — there is
 * nothing here that could accidentally be branched on.
 */
import { NextResponse } from 'next/server';
import { requestResetSchema, confirmResetSchema, HTTP } from '@open-innings/shared';
import { requestPasswordReset, confirmPasswordReset } from '@/lib/services/account';
import { readJson, handle } from '@/lib/api/respond';
import { enforceRateLimit } from '@/lib/api/request-meta';

/** Said to everyone, always. */
const SENT =
  'If that address has an account, a reset link is on its way. It works once, and for an hour.';

export const POST = handle(async (request: Request) => {
  // By IP, since there is no session. Deliberately low: each request that
  // matches an account sends mail, and this endpoint takes an arbitrary
  // address, which makes it the one worth throttling hardest.
  enforceRateLimit(request, 'reset-request', { max: 5, windowMs: 60 * 60_000 });

  const { email } = await readJson(request, requestResetSchema);
  await requestPasswordReset(email);

  return NextResponse.json({ message: SENT }, { status: HTTP.ok });
});

export const PUT = handle(async (request: Request) => {
  enforceRateLimit(request, 'reset-confirm', { max: 20, windowMs: 60 * 60_000 });

  const { token, password } = await readJson(request, confirmResetSchema);
  await confirmPasswordReset(token, password);

  /*
   * No session is issued.
   *
   * Setting the password ends every session on the account, including any the
   * attacker prompting the reset might hold — that is most of the point. Handing
   * a fresh one straight back would be convenient and would mean a stolen link
   * is still a way in without ever knowing the old password. Sign in again.
   */
  return NextResponse.json({
    message: 'Password changed. Every device signed in to this account has been signed out.',
  });
});
