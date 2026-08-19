/**
 * Which end of `x-forwarded-for` we believe.
 *
 * This is the whole security property of every IP-keyed rate limit in the app,
 * and it had no test while it was wrong. Reading the *first* entry reads a
 * header the client controls, so a caller could mint an unlimited supply of
 * rate-limit buckets — a password-guessing oracle on `/api/auth/login`, and an
 * outbound mail bomb on `/api/auth/reset`, which sends a real message per hit.
 */
import { describe, it, expect } from 'vitest';
import { clientIp } from './request-meta';

function req(headers: Record<string, string>): Request {
  return new Request('https://openinnings.com/api/auth/login', { headers });
}

describe('clientIp', () => {
  it('takes the last entry, which is the one the trusted proxy appended', () => {
    // What Heroku produces when a client sends its own header: the claim it
    // made, then the address the router actually saw.
    expect(clientIp(req({ 'x-forwarded-for': '1.0.0.1, 203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('ignores a spoofed chain no matter how long', () => {
    const spoofed = Array.from({ length: 20 }, (_, i) => `10.0.0.${i}`).join(', ');
    expect(clientIp(req({ 'x-forwarded-for': `${spoofed}, 203.0.113.9` }))).toBe('203.0.113.9');
  });

  it('two callers behind one proxy cannot forge different buckets', () => {
    const a = clientIp(req({ 'x-forwarded-for': 'attacker-choice-1, 203.0.113.9' }));
    const b = clientIp(req({ 'x-forwarded-for': 'attacker-choice-2, 203.0.113.9' }));
    expect(a).toBe(b);
  });

  it('handles a single entry, which is what an unmodified request produces', () => {
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('trims whitespace and skips empty entries', () => {
    expect(clientIp(req({ 'x-forwarded-for': ' 1.0.0.1 ,  , 203.0.113.9  ' }))).toBe('203.0.113.9');
  });

  it('falls back to x-real-ip when the chain is absent or empty', () => {
    expect(clientIp(req({ 'x-real-ip': '203.0.113.7' }))).toBe('203.0.113.7');
    expect(clientIp(req({ 'x-forwarded-for': ' , ', 'x-real-ip': '203.0.113.7' }))).toBe(
      '203.0.113.7',
    );
  });

  it('is undefined when nothing identifies the caller', () => {
    expect(clientIp(req({}))).toBeUndefined();
  });
});
