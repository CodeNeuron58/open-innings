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
 * Throttle an endpoint by identity (if signed in) or IP.
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
