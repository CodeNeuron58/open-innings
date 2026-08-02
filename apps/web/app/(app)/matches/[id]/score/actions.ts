'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { startSecondInningsSchema } from '@open-innings/shared';
import { startSecondInnings, endCurrentInnings } from '@/lib/services/matches';
import { formValues, parseForm, redirectWithError } from '@/lib/api/form';

/** Set up the chase: create innings 2 with target = 1st-innings runs + 1. */
export async function startSecondInningsAction(matchId: string, formData: FormData): Promise<void> {
  const scorer = `/matches/${matchId}/score`;

  const input = parseForm(
    startSecondInningsSchema,
    formValues(formData, ['openingStrikerId', 'openingNonStrikerId', 'openingBowlerId']),
    scorer,
  );

  try {
    await startSecondInnings(matchId, input);
  } catch (error) {
    redirectWithError(scorer, error);
  }

  revalidatePath(scorer);
  redirect(scorer);
}

/**
 * End the current innings early — used when a side has no batters left to
 * replace a dismissed one (short squads can't lose 10 wickets).
 */
export async function endInningsAction(matchId: string): Promise<void> {
  const scorer = `/matches/${matchId}/score`;

  try {
    await endCurrentInnings(matchId);
  } catch (error) {
    redirectWithError(scorer, error);
  }

  revalidatePath(scorer);
  redirect(scorer);
}
