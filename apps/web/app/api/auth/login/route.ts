/**
 * POST /api/auth/login — exchange credentials for a session token.
 */
import { NextResponse } from 'next/server';
import { loginSchema, HTTP, type AuthResponse } from '@open-innings/shared';
import { authenticateUser } from '@/lib/services/auth';
import { readJson, handle } from '@/lib/api/respond';
import { requestMeta, enforceRateLimit, sessionCookie } from '@/lib/api/request-meta';

export const POST = handle(async (request: Request) => {
  // Throttled per IP: this endpoint is the password-guessing surface. Counts
  // every attempt, not just failures, so the cap has to stay loose enough not
  // to lock out a shared address — see the CGNAT note in request-meta.ts.
  enforceRateLimit(request, 'login', { max: 30, windowMs: 15 * 60 * 1000 });

  const input = await readJson(request, loginSchema);
  const grant = await authenticateUser(input, requestMeta(request));

  const body: AuthResponse = {
    token: grant.token,
    expiresAt: grant.expiresAt.toISOString(),
    user: grant.user,
  };

  const response = NextResponse.json(body, { status: HTTP.ok });
  response.cookies.set(sessionCookie(grant.token, grant.expiresAt));
  return response;
});
