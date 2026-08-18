/**
 * POST /api/auth/signup — create an account and open a session.
 *
 * Returns the session token as JSON for native clients to put in secure
 * storage, and also sets the session cookie so a browser calling this gets
 * the same result as the form action.
 *
 * A confirmation email goes out too, and **its failure does not fail this
 * request**. Verification is a soft prompt: it unlocks password reset actually
 * reaching somebody, and gates nothing. A scorer opening an account at a
 * ground with a mail provider having a bad afternoon must still end up signed
 * in and scoring — and one bounced message must not cost a tester out of
 * twelve.
 */
import { NextResponse } from 'next/server';
import { signupSchema, HTTP, type AuthResponse } from '@open-innings/shared';
import { registerUser } from '@/lib/services/auth';
import { sendVerificationEmail } from '@/lib/services/account';
import { readJson, handle } from '@/lib/api/respond';
import { requestMeta, enforceRateLimit, sessionCookie } from '@/lib/api/request-meta';

export const POST = handle(async (request: Request) => {
  // Account creation is unauthenticated and writes a row, so it needs a cap —
  // but see the CGNAT warning in request-meta.ts. A whole campus or a mobile
  // carrier can share this IP, so the cap is set to stop a script, not to
  // ration genuine signups.
  enforceRateLimit(request, 'signup', { max: 20, windowMs: 60 * 60 * 1000 });

  const input = await readJson(request, signupSchema);
  const grant = await registerUser(input, requestMeta(request));

  const body: AuthResponse = {
    token: grant.token,
    expiresAt: grant.expiresAt.toISOString(),
    user: grant.user,
  };

  /*
   * Awaited, not fired and forgotten.
   *
   * A serverless-style request that returns before its promises settle can be
   * frozen mid-flight, and the send would be lost silently — the worst
   * possible failure for a message somebody is waiting on. `send` swallows its
   * own errors and reports a boolean, so awaiting costs a few hundred
   * milliseconds on signup and can never throw.
   */
  await sendVerificationEmail(grant.user.id).catch(() => false);

  const response = NextResponse.json(body, { status: HTTP.created });
  response.cookies.set(sessionCookie(grant.token, grant.expiresAt));
  return response;
});
