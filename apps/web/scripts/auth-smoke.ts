/**
 * Smoke test for the local-auth flow.
 * Run with: pnpm tsx scripts/auth-smoke.ts
 *
 * Not a real test suite — just a one-shot script to verify the round trip:
 *   hash password → create user → create session → look up via token
 */
import { db } from '../lib/db/client';
import { users, sessions } from '../lib/db/schema';
import { hashPassword, newSalt, verifyPassword } from '../lib/auth/password';
import { generateSessionToken, createSession, getUserFromToken, destroySession } from '../lib/auth/session';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const email = `smoke-${Date.now()}@local.test`;
  const password = 'smoketest123';
  const salt = newSalt();
  const passwordHash = await hashPassword(password, salt);

  const inserted = await db
    .insert(users)
    .values({ email, displayName: 'Smoke', passwordHash, passwordSalt: salt })
    .returning({ id: users.id });
  const userId = inserted[0]!.id;
  console.log(`✓ Created user: ${email} → ${userId}`);

  // Verify password roundtrip
  const ok = await verifyPassword(password, salt, passwordHash);
  if (!ok) throw new Error('Password verify failed');
  console.log('✓ Password verify works');

  // Wrong password should fail
  const bad = await verifyPassword('wrong', salt, passwordHash);
  if (bad) throw new Error('Wrong password verified!');
  console.log('✓ Wrong password correctly rejected');

  // Session
  const { token, expiresAt } = await createSession(userId, { userAgent: 'smoke-test' });
  console.log(`✓ Created session, expires ${expiresAt.toISOString()}`);

  const looked = await getUserFromToken(token);
  if (!looked || looked.id !== userId) throw new Error('Session lookup failed');
  console.log(`✓ Session lookup returned user: ${looked.email}`);

  // Unknown token
  const fake = await getUserFromToken('not-a-real-token');
  if (fake) throw new Error('Unknown token was accepted!');
  console.log('✓ Unknown token rejected');

  // Cleanup
  await destroySession(token);
  const afterDestroy = await getUserFromToken(token);
  if (afterDestroy) throw new Error('Session still valid after destroy');
  console.log('✓ Destroy works');

  // Clean up the user
  await db.delete(users).where(eq(users.id, userId));
  console.log('✓ Smoke test cleanup done');
  console.log('\n🎉 Auth round-trip works end-to-end.');

  process.exit(0);
}

main().catch((err) => {
  console.error('✗ Smoke test failed:', err);
  process.exit(1);
});