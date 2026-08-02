'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, destroySession } from '@/lib/auth/session';

export async function signOutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  await destroySession(token);
  cookieStore.delete(SESSION_COOKIE);
  redirect('/');
}
