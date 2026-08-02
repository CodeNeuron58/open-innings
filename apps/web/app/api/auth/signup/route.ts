/**
 * POST /api/auth/signup — create an account and open a session.
 *
 * Returns the session token as JSON for native clients to put in secure
 * storage, and also sets the session cookie so a browser calling this gets
 * the same result as the form action.
 */
import { NextResponse } from 'next/server';
import { signupSchema, HTTP, type AuthResponse } from '@open-innings/shared';
import { registerUser } from '@/lib/services/auth';
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

  const response = NextResponse.json(body, { status: HTTP.created });
  response.cookies.set(sessionCookie(grant.token, grant.expiresAt));
  return response;
});
