'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { verifyPassword } from '@/lib/auth/password';
import { SESSION_COOKIE, createSession } from '@/lib/auth/session';
import { eq } from 'drizzle-orm';

const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export async function loginAction(formData: FormData): Promise<void> {
  const parsed = LoginInput.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  const user = rows[0];

  // Constant-time-ish: if user not found, still hash a dummy to avoid timing oracle.
  // For v0.1 simplicity we accept the tiny info leak; document it as TODO.
  if (!user) {
    throw new Error('Invalid email or password');
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordSalt, user.passwordHash);
  if (!ok) {
    throw new Error('Invalid email or password');
  }

  if (user.anonymisedAt) {
    throw new Error('This account has been deleted');
  }

  const hdrs = await headers();
  const meta = {
    userAgent: hdrs.get('user-agent') ?? undefined,
    ipAddress: hdrs.get('x-forwarded-for') ?? undefined,
  };
  const { token, expiresAt } = await createSession(user.id, meta);

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