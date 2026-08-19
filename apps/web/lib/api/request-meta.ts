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
 * How many proxies in front of this app can be trusted to have appended an
 * honest entry to `x-forwarded-for`. One, on Heroku: its router and nothing
 * else. Override only if you put a CDN in front, and count the hops exactly —
 * too many trusts the client again, too few blames the CDN for everyone.
 */
const TRUSTED_PROXY_HOPS = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);

/**
 * Best-effort client IP.
 *
 * `x-forwarded-for` is a chain, and reading the **first** entry reads whatever
 * the client sent. Every proxy appends, so the trustworthy end is the right:
 * with one proxy the last entry is the address it actually saw the connection
 * from, and everything left of it is the client's own claim.
 *
 * That distinction is the whole security property here. A client sending
 * `X-Forwarded-For: 1.0.0.1` to Heroku produces `1.0.0.1, <real ip>` — taking
 * the first entry hands every caller an unlimited supply of rate-limit
 * buckets, which is a password-guessing oracle on `/api/auth/login` and a
 * mail bomb on `/api/auth/reset`.
 *
 * Still not identity — a determined attacker with many real addresses is not
 * stopped by this. It is a rate-limiting key that cannot be forged from a
 * single host.
 */
export function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const chain = forwarded
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (chain.length > 0) {
      return chain[Math.max(0, chain.length - TRUSTED_PROXY_HOPS)];
    }
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
