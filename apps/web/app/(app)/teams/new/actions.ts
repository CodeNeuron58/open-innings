'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createTeamSchema } from '@open-innings/shared';
import { createTeamFor } from '@/lib/services/squads';
import { formValues, parseForm, redirectWithError } from '@/lib/api/form';

const FORM = '/teams/new';

export async function createTeamAction(formData: FormData): Promise<void> {
  const input = parseForm(
    createTeamSchema,
    formValues(formData, ['name', 'shortName', 'homeGround']),
    FORM,
  );

  // Multi-value field, so it can't come from `formValues`.
  const playerIds = (formData.getAll('playerIds') as string[]).filter(Boolean);

  try {
    await createTeamFor(input, playerIds);
  } catch (error) {
    redirectWithError(FORM, error);
  }

  revalidatePath('/teams');
  redirect('/teams');
}
