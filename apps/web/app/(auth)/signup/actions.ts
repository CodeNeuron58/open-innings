'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { signupSchema } from '@open-innings/shared';
import { registerUser } from '@/lib/services/auth';
import { sessionCookie } from '@/lib/api/request-meta';
import { formValues, parseForm, redirectWithError } from '@/lib/api/form';

const FORM = '/signup';

export async function signupAction(formData: FormData): Promise<void> {
  const input = parseForm(
    signupSchema,
    formValues(formData, ['email', 'password', 'displayName']),
    FORM,
  );

  const hdrs = await headers();
  const meta = {
    userAgent: hdrs.get('user-agent') ?? undefined,
    ipAddress: hdrs.get('x-forwarded-for') ?? undefined,
  };

  // Only the service call is guarded — redirect() throws a control-flow
  // signal Next.js catches, so it must stay outside the try.
  let grant;
  try {
    grant = await registerUser(input, meta);
  } catch (error) {
    redirectWithError(FORM, error);
  }

  const cookieStore = await cookies();
  cookieStore.set(sessionCookie(grant.token, grant.expiresAt));

  redirect('/dashboard');
}
