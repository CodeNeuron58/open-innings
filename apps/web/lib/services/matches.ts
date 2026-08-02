/**
 * Match lifecycle, transport-free.
 *
 * Ownership is re-checked here rather than trusted from the caller — both the
 * web action and the REST handler route through these, and a rule enforced in
 * only one of them is a rule that isn't enforced.
 */
import 'server-only';
import type { CreateMatchInput, StartSecondInningsInput } from '@open-innings/shared';
import { resolveBattingSides } from '@open-innings/shared';
import {
  createMatch,
  createInning,
  startMatch,
  updateInningCache,
  getTeamMembers,
  getMatch,
  getInnings,
  getInning,
  getTeam,
  deleteMatch,
  completeMatch,
} from '@/lib/db/queries';
import { getUserId } from '@/lib/auth/local';
import { computeMatchResult, formatMatchResult } from '@/lib/match-result';
import { invalid, notFound, unauthorized } from './errors';

/** Load a match the current user owns, or throw. */
async function requireOwnedMatch(matchId: string) {
  const userId = await getUserId();
  if (!userId) throw unauthorized();

  const match = await getMatch(matchId);
  // Not-yours is reported as not-found — see the note in errors.ts.
  if (!match || match.createdBy !== userId) throw notFound('Match not found');

  return { match, userId };
}

/**
 * Create a match, open innings 1, and put it live.
 *
 * The client filters opener dropdowns to the right squad, but a request can
 * be crafted directly, so squad membership is re-checked here. The Zod schema
 * can't do this — it needs a database round trip.
 */
export async function createMatchWithFirstInnings(input: CreateMatchInput) {
  const userId = await getUserId();
  if (!userId) throw unauthorized('Sign in to create a match');

  const { battingTeamId, bowlingTeamId } = resolveBattingSides(
    input.teamAId,
    input.teamBId,
    input.tossWinnerTeamId,
    input.tossDecision,
  );

  const [battingSquad, bowlingSquad] = await Promise.all([
    getTeamMembers(battingTeamId),
    getTeamMembers(bowlingTeamId),
  ]);
  const inBattingSquad = (id: string) => battingSquad.some((p) => p.id === id);
  const inBowlingSquad = (id: string) => bowlingSquad.some((p) => p.id === id);

  if (!inBattingSquad(input.openingStrikerId) || !inBattingSquad(input.openingNonStrikerId)) {
    throw invalid('Opening batters must be in the batting squad', 'openingStrikerId');
  }
  if (!inBowlingSquad(input.openingBowlerId)) {
    throw invalid('The opening bowler must be in the bowling squad', 'openingBowlerId');
  }

  const match = await createMatch({
    title: input.title,
    venue: input.venue,
    oversPerInnings: input.oversPerInnings,
    teamAId: input.teamAId,
    teamBId: input.teamBId,
    tossWinnerTeamId: input.tossWinnerTeamId,
    tossDecision: input.tossDecision,
  });
  if (!match) throw unauthorized('Could not create match — sign in first');

  await startMatch(match.id);

  const inning = await createInning({
    matchId: match.id,
    inningsNumber: 1,
    battingTeamId,
    bowlingTeamId,
    openingStrikerId: input.openingStrikerId,
    openingNonStrikerId: input.openingNonStrikerId,
    openingBowlerId: input.openingBowlerId,
  });
  if (!inning) throw new Error('Could not create innings');

  await updateInningCache(inning.id, { status: 'in_progress', startedAt: new Date() });

  // Re-read rather than returning the row from the INSERT: `startMatch` and
  // `updateInningCache` have both written since, so the in-memory objects
  // still say `scheduled` / `not_started`. The web action only ever redirected
  // so it never noticed, but an API client reads these fields.
  const [liveMatch, freshInning] = await Promise.all([getMatch(match.id), getInning(inning.id)]);

  return { match: liveMatch ?? match, inning: freshInning ?? inning };
}

/**
 * Open innings 2 with the target set from innings 1.
 *
 * Idempotent on double-submit: if innings 2 already exists it returns it
 * rather than creating a second one.
 */
export async function startSecondInnings(matchId: string, input: StartSecondInningsInput) {
  const { match } = await requireOwnedMatch(matchId);

  const allInnings = await getInnings(matchId);
  const first = allInnings.find((i) => i.inningsNumber === 1);
  if (!first || first.status !== 'completed') {
    throw invalid('The first innings has not finished yet');
  }

  const existing = allInnings.find((i) => i.inningsNumber === 2);
  if (existing) return { match, inning: existing, alreadyExisted: true as const };

  const inning = await createInning({
    matchId: match.id,
    inningsNumber: 2,
    battingTeamId: first.bowlingTeamId,
    bowlingTeamId: first.battingTeamId,
    target: first.runs + 1,
    openingStrikerId: input.openingStrikerId,
    openingNonStrikerId: input.openingNonStrikerId,
    openingBowlerId: input.openingBowlerId,
  });
  if (!inning) throw new Error('Could not create the second innings');

  await updateInningCache(inning.id, { status: 'in_progress', startedAt: new Date() });

  return { match, inning, alreadyExisted: false as const };
}

/**
 * Close the innings in progress.
 *
 * Used when a side has no batters left to replace a dismissed one — a short
 * squad can't lose ten wickets. Ending the chase early also settles the match.
 */
export async function endCurrentInnings(matchId: string) {
  const { match } = await requireOwnedMatch(matchId);

  const allInnings = await getInnings(matchId);
  const current = allInnings.find((i) => i.status === 'in_progress');
  if (!current) throw invalid('No innings is in progress');

  await updateInningCache(current.id, { status: 'completed', completedAt: new Date() });

  if (current.inningsNumber >= 2 && current.target != null) {
    const result = computeMatchResult({
      runs: current.runs,
      wickets: current.wickets,
      target: current.target,
      maxWickets: current.maxWickets,
      battingTeamId: current.battingTeamId,
      bowlingTeamId: current.bowlingTeamId,
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

  return { match, inning: current };
}

/** Delete a match and everything scored in it. Blocked while it's live. */
export async function deleteOwnedMatch(matchId: string) {
  const { match, userId } = await requireOwnedMatch(matchId);

  // Racing the auto-complete-on-chase-win logic corrupts the result, so a
  // live match must be finished or abandoned first.
  if (match.status === 'live') {
    throw invalid('Finish or abandon the match before deleting it');
  }

  await deleteMatch(matchId, userId);
}
