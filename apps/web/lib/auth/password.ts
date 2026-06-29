/**
 * Open Innings — password hashing.
 *
 * Uses Argon2id (via @node-rs/argon2, a native binding — fast + memory-hard).
 * Each password gets its own random salt, stored alongside the hash.
 *
 * We store hash and salt separately (rather than as a single PHC-format string)
 * because our schema has explicit columns. The combination is equivalent.
 */
import { hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

// Tuned for interactive sign-in: ~50ms on a modern CPU, resistant to GPU attacks.
const ARGON2_OPTS = {
  // 2 = Argon2id. Numeric literal because TS isolatedModules forbids
  // importing ambient const enums from third-party packages.
  algorithm: 2 as const,
  memoryCost: 19_456, // 19 MiB — OWASP minimum
  timeCost: 2,
  parallelism: 1,
};

export function newSalt(): string {
  return randomBytes(16).toString('hex');
}

export async function hashPassword(plain: string, salt: string): Promise<string> {
  // Argon2's "salt" param expects raw bytes; we hex-decode ours.
  const saltBytes = Buffer.from(salt, 'hex');
  return hash(plain, { ...ARGON2_OPTS, salt: saltBytes });
}

export async function verifyPassword(
  plain: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const saltBytes = Buffer.from(salt, 'hex');
  return verify(expectedHash, plain, { ...ARGON2_OPTS, salt: saltBytes });
}