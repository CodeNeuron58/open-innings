/**
 * Proxy — optimistic auth check for the app's protected pages.
 *
 * This is deliberately NOT a full session check: per Next's own guidance,
 * proxy runs on every request (including prefetches), so it should only
 * read the cookie, never hit the database. Real validation — is the token
 * still valid, has it expired, does it belong to this resource — happens
 * where it already did: `getUserId()` in each page/layout/action, which
 * does the actual DB lookup. This just keeps a request with no session
 * cookie at all from ever reaching those pages.
 *
 * Why this exists as a proxy check rather than relying solely on the
 * page-level `redirect()` calls: on this deploy, `redirect()` thrown from
 * a Server Component during a full-page render doesn't produce a real
 * HTTP redirect — a lower-level Next/Node incompatibility, not something
 * fixable here. `NextResponse.redirect()` below is a different mechanism
 * (a plain HTTP response, not a render-time throw) and isn't affected.
 */
import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'oi_session'; // mirrors lib/auth/session.ts — kept as
// a literal here, not imported, so this file never pulls in the DB client.

const PROTECTED_PREFIXES = ['/dashboard', '/matches', '/players', '/teams'];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isProtected(pathname) && !request.cookies.get(SESSION_COOKIE)?.value) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    // Skip static assets and Next internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
