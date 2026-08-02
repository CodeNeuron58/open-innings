'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { loginSchema } from '@open-innings/shared';
import { authenticateUser } from '@/lib/services/auth';
import { sessionCookie } from '@/lib/api/request-meta';
import { formValues, parseForm, redirectWithError } from '@/lib/api/form';

const FORM = '/login';

export async function loginAction(formData: FormData): Promise<void> {
  const input = parseForm(loginSchema, formValues(formData, ['email', 'password']), FORM);

  const hdrs = await headers();
  const meta = {
    userAgent: hdrs.get('user-agent') ?? undefined,
    ipAddress: hdrs.get('x-forwarded-for') ?? undefined,
  };

  let grant;
  try {
    grant = await authenticateUser(input, meta);
  } catch (error) {
    redirectWithError(FORM, error);
  }

  const cookieStore = await cookies();
  cookieStore.set(sessionCookie(grant.token, grant.expiresAt));

  redirect('/dashboard');
}
