'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createMatchSchema } from '@open-innings/shared';
import { createMatchWithFirstInnings } from '@/lib/services/matches';
import { formValues, parseForm, redirectWithError } from '@/lib/api/form';

const FORM = '/matches/new';

export async function createMatchAction(formData: FormData): Promise<void> {
  const input = parseForm(
    createMatchSchema,
    formValues(formData, [
      'title',
      'venue',
      'oversPerInnings',
      'teamAId',
      'teamBId',
      'tossWinnerTeamId',
      'tossDecision',
      'openingStrikerId',
      'openingNonStrikerId',
      'openingBowlerId',
    ]),
    FORM,
  );

  // Only the service call is guarded — redirect() throws a control-flow
  // signal Next.js catches, so it must stay outside the try.
  let match;
  try {
    ({ match } = await createMatchWithFirstInnings(input));
  } catch (error) {
    redirectWithError(FORM, error);
  }

  revalidatePath('/matches');
  redirect(`/matches/${match.id}/score`);
}
