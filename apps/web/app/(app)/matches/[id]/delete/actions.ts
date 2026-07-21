'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getMatch, deleteMatch } from '@/lib/db/queries';
import { getUserId } from '@/lib/auth/local';

/** User-facing failures redirect back to the matches list — never the error page. */
function fail(message: string): never {
  redirect(`/matches?error=${encodeURIComponent(message)}`);
}

export async function deleteMatchAction(matchId: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) redirect('/login');

  const match = await getMatch(matchId);
  if (!match || match.createdBy !== userId) fail('Match not found');
  if (match.status === 'live') {
    fail('Finish or abandon the match before deleting it');
  }

  await deleteMatch(matchId, userId);
  revalidatePath('/matches');
  redirect('/matches');
}
