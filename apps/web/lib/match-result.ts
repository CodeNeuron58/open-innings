/**
 * Match result computation — pure, app-level (not part of the ball engine).
 *
 * Called when the chase innings (innings 2+) completes. The chase innings
 * always carries `target` = first-innings runs + 1.
 */

export type ChaseInnings = {
  runs: number;
  wickets: number;
  target: number;
  maxWickets: number;
  battingTeamId: string;
  bowlingTeamId: string;
};

export type MatchResult = {
  /** null = tie */
  winningTeamId: string | null;
  marginRuns?: number;
  marginWickets?: number;
};

export function computeMatchResult(inn: ChaseInnings): MatchResult {
  if (inn.runs >= inn.target) {
    return {
      winningTeamId: inn.battingTeamId,
      marginWickets: Math.max(1, inn.maxWickets - inn.wickets),
    };
  }
  if (inn.runs === inn.target - 1) {
    return { winningTeamId: null };
  }
  return {
    winningTeamId: inn.bowlingTeamId,
    marginRuns: inn.target - 1 - inn.runs,
  };
}

export function formatMatchResult(
  result: MatchResult,
  winnerName: string | null | undefined,
): string {
  if (result.winningTeamId === null) return 'Match tied';
  const name = winnerName ?? 'Winner';
  if (result.marginWickets !== undefined) {
    return `${name} won by ${result.marginWickets} wicket${result.marginWickets === 1 ? '' : 's'}`;
  }
  return `${name} won by ${result.marginRuns} run${result.marginRuns === 1 ? '' : 's'}`;
}
