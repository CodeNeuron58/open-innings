'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  createMatch,
  createInning,
  startMatch,
  updateInningCache,
  getTeamMembers,
} from '@/lib/db/queries';
import { resolveBattingSides } from '@open-innings/shared';

/** User-facing failures redirect back to the form — never the error page. */
function fail(message: string): never {
  redirect(`/matches/new?error=${encodeURIComponent(message)}`);
}

export async function createMatchAction(formData: FormData): Promise<void> {
  const title = ((formData.get('title') as string) ?? '').trim() || undefined;
  const venue = ((formData.get('venue') as string) ?? '').trim() || undefined;
  const oversPerInnings = parseInt(formData.get('oversPerInnings') as string, 10);
  const teamAId = formData.get('teamAId') as string;
  const teamBId = formData.get('teamBId') as string;
  const tossWinnerTeamId = (formData.get('tossWinnerTeamId') as string) || undefined;
  const tossDecision = (formData.get('tossDecision') as 'bat' | 'bowl') || undefined;

  const openingStrikerId = formData.get('openingStrikerId') as string;
  const openingNonStrikerId = formData.get('openingNonStrikerId') as string;
  const openingBowlerId = formData.get('openingBowlerId') as string;

  if (!teamAId || !teamBId || teamAId === teamBId) {
    fail('Pick two different teams');
  }
  if (!Number.isFinite(oversPerInnings) || oversPerInnings < 1) {
    fail('Overs must be a positive number');
  }
  if (!openingStrikerId || !openingNonStrikerId || !openingBowlerId) {
    fail('Pick opening batters and a bowler');
  }
  if (openingStrikerId === openingNonStrikerId) {
    fail('Striker and non-striker must be different');
  }

  const { battingTeamId, bowlingTeamId } = resolveBattingSides(
    teamAId,
    teamBId,
    tossWinnerTeamId,
    tossDecision,
  );

  // The client filters opener dropdowns to the right squad, but a request
  // can be crafted directly — re-check server-side before anything is written.
  const [battingSquad, bowlingSquad] = await Promise.all([
    getTeamMembers(battingTeamId),
    getTeamMembers(bowlingTeamId),
  ]);
  const inBattingSquad = (id: string) => battingSquad.some((p) => p.id === id);
  const inBowlingSquad = (id: string) => bowlingSquad.some((p) => p.id === id);
  if (
    !inBattingSquad(openingStrikerId) ||
    !inBattingSquad(openingNonStrikerId) ||
    !inBowlingSquad(openingBowlerId)
  ) {
    fail('Openers must be from the correct squad');
  }

  const match = await createMatch({
    title,
    venue,
    oversPerInnings,
    teamAId,
    teamBId,
    tossWinnerTeamId,
    tossDecision,
  });
  if (!match) fail('Could not create match — sign in first');

  await startMatch(match.id);

  const inning = await createInning({
    matchId: match.id,
    inningsNumber: 1,
    battingTeamId,
    bowlingTeamId,
    openingStrikerId,
    openingNonStrikerId,
    openingBowlerId,
  });
  if (!inning) throw new Error('Could not create innings');

  await updateInningCache(inning.id, {
    status: 'in_progress',
    startedAt: new Date(),
  });

  revalidatePath('/matches');
  redirect(`/matches/${match.id}/score`);
}
