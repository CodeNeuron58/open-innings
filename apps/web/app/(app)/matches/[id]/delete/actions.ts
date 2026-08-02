'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { deleteOwnedMatch } from '@/lib/services/matches';
import { redirectWithError } from '@/lib/api/form';

export async function deleteMatchAction(matchId: string): Promise<void> {
  try {
    await deleteOwnedMatch(matchId);
  } catch (error) {
    redirectWithError('/matches', error);
  }

  revalidatePath('/matches');
  redirect('/matches');
}
