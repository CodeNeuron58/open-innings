/**
 * Toss resolution — which team bats first.
 *
 * Pure and isomorphic (no `server-only`, no `next/navigation`) so it can be
 * imported from both the new-match client component (to filter opener
 * dropdowns live) and the server action that actually creates the match —
 * the two can never disagree about who's batting.
 *
 * With no toss recorded yet, Team A bats by default — matches the
 * pre-existing behaviour of `createMatchAction` before toss is picked.
 */
export function resolveBattingSides(
  teamAId: string,
  teamBId: string,
  tossWinnerTeamId: string | undefined,
  tossDecision: 'bat' | 'bowl' | undefined,
): { battingTeamId: string; bowlingTeamId: string } {
  if (!tossWinnerTeamId || !tossDecision) {
    return { battingTeamId: teamAId, bowlingTeamId: teamBId };
  }
  if (tossDecision === 'bowl') {
    return {
      battingTeamId: tossWinnerTeamId === teamAId ? teamBId : teamAId,
      bowlingTeamId: tossWinnerTeamId,
    };
  }
  return {
    battingTeamId: tossWinnerTeamId,
    bowlingTeamId: tossWinnerTeamId === teamAId ? teamBId : teamAId,
  };
}
