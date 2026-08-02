'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createPlayerSchema } from '@open-innings/shared';
import { createPlayerFor } from '@/lib/services/squads';
import { formValues, parseForm, redirectWithError } from '@/lib/api/form';

const FORM = '/players/new';

export async function createPlayerAction(formData: FormData): Promise<void> {
  const input = parseForm(
    createPlayerSchema,
    formValues(formData, ['fullName', 'shortName', 'battingStyle', 'bowlingStyle', 'role']),
    FORM,
  );

  try {
    await createPlayerFor(input);
  } catch (error) {
    redirectWithError(FORM, error);
  }

  revalidatePath('/players');
  redirect('/players');
}
