'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  createMatch,
  createInning,
  startMatch,
  updateInningCache,
} from '@/lib/db/queries';

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
    throw new Error('Pick two different teams');
  }
  if (!Number.isFinite(oversPerInnings) || oversPerInnings < 1) {
    throw new Error('Overs must be a positive number');
  }
  if (!openingStrikerId || !openingNonStrikerId || !openingBowlerId) {
    throw new Error('Pick opening batsmen and bowler');
  }
  if (openingStrikerId === openingNonStrikerId) {
    throw new Error('Striker and non-striker must be different');
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
  if (!match) throw new Error('Could not create match. Sign in first.');

  let battingTeamId = teamAId;
  let bowlingTeamId = teamBId;
  if (tossWinnerTeamId && tossDecision) {
    if (tossDecision === 'bowl') {
      battingTeamId = tossWinnerTeamId === teamAId ? teamBId : teamAId;
      bowlingTeamId = tossWinnerTeamId;
    } else {
      battingTeamId = tossWinnerTeamId;
      bowlingTeamId = tossWinnerTeamId === teamAId ? teamBId : teamAId;
    }
  }

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