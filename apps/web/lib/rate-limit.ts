/**
 * Tiny in-process rate limiter for hot paths (ball event submissions, logins).
 *
 * Not suitable for multi-instance deployments (each instance has its own
 * counter). For v0.1, single-instance is fine. v0.3 will swap to Redis.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  options: { max: number; windowMs: number },
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.max - 1, resetMs: options.windowMs };
  }

  if (bucket.count >= options.max) {
    return { allowed: false, remaining: 0, resetMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: options.max - bucket.count,
    resetMs: bucket.resetAt - now,
  };
}

/** Clean up expired buckets periodically so we don't leak memory. */
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}, 60_000).unref?.();
