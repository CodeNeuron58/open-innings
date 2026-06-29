/**
 * Middleware — none needed for v0.1.
 *
 * Local-auth sessions are sliding (extended on every server-side read in
 * `getUserFromToken`). No token refresh, no cookie rewriting. Just hit a
 * server component and the session is validated and bumped in one trip.
 *
 * Kept as an empty file so Next.js still has a middleware entrypoint in case
 * we need it later (CSP headers, rate limits, etc).
 */
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    // Skip static assets and Next internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};