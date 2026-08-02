/**
 * Request metadata shared by the auth handlers.
 */
import { HTTP } from '@open-innings/shared';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { ServiceError } from '@/lib/services/errors';
import { rateLimit } from '@/lib/rate-limit';
import type { RequestMeta } from '@/lib/services/auth';

/** User agent and client IP, recorded against the session row. */
export function requestMeta(request: Request): RequestMeta {
  return {
    userAgent: request.headers.get('user-agent') ?? undefined,
    ipAddress: clientIp(request),
  };
}

/**
 * Best-effort client IP.
 *
 * `x-forwarded-for` is a comma-separated chain and only the first entry is the
 * original client. It's trivially spoofable without a trusted proxy in front,
 * so treat this as a rate-limiting hint, never as identity.
 */
export function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') ?? undefined;
}

/**
 * Throttle an endpoint.
 *
 * Keys on `identity` when given — a user id, for authenticated endpoints —
 * and falls back to client IP. That distinction matters for scoring: a whole
 * club shares one IP behind NAT, so an IP-keyed limit on the ball endpoint
 * would throttle the second scorer in the room.
 *
 * ⚠️ IP keying is a blunt instrument for this app specifically. Indian mobile
 * carriers run CGNAT, so thousands of unrelated users can present the same
 * address — a tight IP-keyed cap on the unauthenticated endpoints would lock
 * out real signups, not attackers. The caps below are therefore deliberately
 * loose. Two follow-ups make them safe to tighten: count only *failed*
 * attempts (a successful login shouldn't spend anyone's budget), and move the
 * counter to Redis so instances share it.
 *
 * In-process, so each instance counts separately — fine for a single-instance
 * deployment, and the limiter's own docs flag Redis as the v0.3 fix.
 */
export function enforceRateLimit(
  request: Request,
  bucket: string,
  options: { max: number; windowMs: number; identity?: string },
): void {
  const who = options.identity ?? clientIp(request) ?? 'unknown';
  const result = rateLimit(`${bucket}:${who}`, options);
  if (!result.allowed) {
    const seconds = Math.ceil(result.resetMs / 1000);
    throw new ServiceError(`Too many attempts. Try again in ${seconds}s.`, HTTP.tooManyRequests);
  }
}

/** Cookie options for the session cookie. Kept in one place so they can't drift. */
export function sessionCookie(token: string, expiresAt: Date) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    expires: expiresAt,
    path: '/',
  };
}
