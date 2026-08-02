'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, destroySession } from '@/lib/auth/session';
import { getSessionToken } from '@/lib/auth/local';

export async function signOutAction(): Promise<void> {
  // Destroys whichever token the request presented, so this stays correct if
  // the action is ever reached with a bearer header rather than a cookie.
  await destroySession(await getSessionToken());

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect('/');
}
