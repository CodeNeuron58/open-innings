'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  getMatch,
  getInnings,
  getTeam,
  createInning,
  updateInningCache,
  completeMatch,
} from '@/lib/db/queries';
import { getUserId } from '@/lib/auth/local';
import { computeMatchResult, formatMatchResult } from '@/lib/match-result';

async function requireOwnedMatch(matchId: string) {
  const userId = await getUserId();
  if (!userId) redirect('/login');
  const match = await getMatch(matchId);
  if (!match || match.createdBy !== userId) redirect('/matches');
  return match;
}

/** Set up the chase: create innings 2 with target = 1st-innings runs + 1. */
export async function startSecondInningsAction(matchId: string, formData: FormData): Promise<void> {
  const match = await requireOwnedMatch(matchId);

  const openingStrikerId = formData.get('openingStrikerId') as string;
  const openingNonStrikerId = formData.get('openingNonStrikerId') as string;
  const openingBowlerId = formData.get('openingBowlerId') as string;

  const fail = (msg: string): never =>
    redirect(`/matches/${matchId}/score?error=${encodeURIComponent(msg)}`);

  if (!openingStrikerId || !openingNonStrikerId || !openingBowlerId) {
    fail('Pick both opening batters and the opening bowler');
  }
  if (openingStrikerId === openingNonStrikerId) {
    fail('Striker and non-striker must be different players');
  }

  const allInnings = await getInnings(matchId);
  const first = allInnings.find((i) => i.inningsNumber === 1);
  if (!first || first.status !== 'completed') {
    fail('The first innings has not finished yet');
    return;
  }
  if (allInnings.some((i) => i.inningsNumber === 2)) {
    // Already created (double submit) — just go back to the scorer.
    redirect(`/matches/${match.id}/score`);
  }

  const inning = await createInning({
    matchId: match.id,
    inningsNumber: 2,
    battingTeamId: first.bowlingTeamId,
    bowlingTeamId: first.battingTeamId,
    target: first.runs + 1,
    openingStrikerId,
    openingNonStrikerId,
    openingBowlerId,
  });
  if (!inning) fail('Could not create the second innings');

  await updateInningCache(inning!.id, {
    status: 'in_progress',
    startedAt: new Date(),
  });

  revalidatePath(`/matches/${matchId}/score`);
  redirect(`/matches/${matchId}/score`);
}

/**
 * End the current innings early — used when a side has no batters left to
 * replace a dismissed one (short squads can't lose 10 wickets).
 */
export async function endInningsAction(matchId: string): Promise<void> {
  const match = await requireOwnedMatch(matchId);

  const allInnings = await getInnings(matchId);
  const current = allInnings.find((i) => i.status === 'in_progress');
  if (!current) redirect(`/matches/${matchId}/score`);

  await updateInningCache(current!.id, {
    status: 'completed',
    completedAt: new Date(),
  });

  // Ending the chase early settles the match.
  if (current!.inningsNumber >= 2 && current!.target != null) {
    const result = computeMatchResult({
      runs: current!.runs,
      wickets: current!.wickets,
      target: current!.target,
      maxWickets: current!.maxWickets,
      battingTeamId: current!.battingTeamId,
      bowlingTeamId: current!.bowlingTeamId,
    });
    const winner = result.winningTeamId
      ? await getTeam(result.winningTeamId).catch(() => null)
      : null;
    await completeMatch(matchId, {
      result:
        result.winningTeamId === null
          ? 'tie'
          : result.winningTeamId === match.teamAId
            ? 'team_a_win'
            : 'team_b_win',
      winningTeamId: result.winningTeamId,
      summary: formatMatchResult(result, winner?.name),
    });
  }

  revalidatePath(`/matches/${matchId}/score`);
  redirect(`/matches/${matchId}/score`);
}
