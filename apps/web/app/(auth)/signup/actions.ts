'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { hashPassword, newSalt } from '@/lib/auth/password';
import { SESSION_COOKIE, createSession } from '@/lib/auth/session';
import { eq } from 'drizzle-orm';

const SignupInput = z.object({
  // Dev-friendly: accept anything with '@' (real TLD validation is too strict for dev seeds).
  // TODO(prod): tighten this back to z.string().email() before public launch.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Enter a valid email')
    .regex(/^[^@\s]+@[^@\s]+$/, 'Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().trim().min(1).max(80).optional(),
});

export async function signupAction(formData: FormData): Promise<void> {
  const parsed = SignupInput.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    displayName: formData.get('displayName') || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  // Reject duplicate email up front for a friendlier error than a FK violation.
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);
  if (existing.length > 0) {
    throw new Error('An account with that email already exists');
  }

  const salt = newSalt();
  const passwordHash = await hashPassword(parsed.data.password, salt);

  const inserted = await db
    .insert(users)
    .values({
      email: parsed.data.email,
      displayName: parsed.data.displayName ?? parsed.data.email.split('@')[0],
      passwordHash,
      passwordSalt: salt,
    })
    .returning({ id: users.id });

  const userId = inserted[0]?.id;
  if (!userId) throw new Error('Could not create user');

  // Sign the user in immediately (no separate sign-in step).
  const hdrs = await headers();
  const meta = {
    userAgent: hdrs.get('user-agent') ?? undefined,
    ipAddress: hdrs.get('x-forwarded-for') ?? undefined,
  };
  const { token, expiresAt } = await createSession(userId, meta);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });

  redirect('/dashboard');
}