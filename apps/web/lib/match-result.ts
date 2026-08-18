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
  opts: { superOver?: boolean } = {},
): string {
  if (result.winningTeamId === null) {
    // A tied super over needs another one, and innings are capped at four —
    // see migration 0010. Said plainly rather than reported as a plain tie,
    // which would look like the super over had not happened.
    return opts.superOver ? 'Super Over tied' : 'Match tied';
  }
  const name = winnerName ?? 'Winner';
  /*
   * Nobody says a super over was won by seven runs. It is one over a side and
   * the margin is not the story — "won the Super Over" is how it is reported
   * and how a scorer would read it back.
   */
  if (opts.superOver) return `${name} won the Super Over`;
  if (result.marginWickets !== undefined) {
    return `${name} won by ${result.marginWickets} wicket${result.marginWickets === 1 ? '' : 's'}`;
  }
  return `${name} won by ${result.marginRuns} run${result.marginRuns === 1 ? '' : 's'}`;
}
