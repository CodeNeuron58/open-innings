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
  abandonMatch,
} from '@/lib/db/queries';
import { getUserId } from '@/lib/auth/local';
import { computeMatchResult, formatMatchResult } from '@/lib/match-result';
import { invalid, notFound, unauthorized } from './errors';

/*
 * The two functions below are exported for tests, not for callers.
 *
 * They are the only arithmetic in this file and both are pure, but they were
 * reachable only through `createMatchWithFirstInnings`, which needs a database.
 * Sizing an innings wrongly is invisible until a six-a-side side cannot be
 * bowled out, so they are worth asserting directly.
 */

/**
 * How many wickets this side can lose before the innings is over.
 *
 * One fewer than the number of players, because the last batter has nobody to
 * bat with. This used to be a hardcoded ten, so a six-a-side or box-cricket
 * team could **never be bowled out** — the innings ran to the over limit with
 * nobody left to come in, and the scorer had to notice and end it by hand.
 *
 * Capped at ten rather than taken from the squad alone: a club may register
 * fifteen players against a team, but only eleven bat.
 */
export function sizeMaxWickets(squadSize: number): number {
  return Math.min(10, Math.max(1, squadSize - 1));
}

/**
 * The per-bowler over limit to apply, given what the client asked for.
 *
 * Three-way, matching the schema. `undefined` means "use the competition's
 * usual rule" and is the common case; explicit `null` means no limit, which
 * gully cricket needs; a number is taken as given.
 *
 * The usual rule is a fifth of the innings rounded up — four overs in a T20,
 * ten in a fifty-over game. It is applied **only when the bowling side can
 * actually cover the innings under it**, which is the check that makes turning
 * this on safe: five bowlers at four overs cover twenty, but four players
 * capped at one over each cannot bowl five, and a quota nobody is left to
 * satisfy would deadlock the innings with every remaining delivery refused.
 */
export function sizeBowlerQuota(
  requested: number | null | undefined,
  oversPerInnings: number,
  bowlingSquadSize: number,
): number | null {
  if (requested !== undefined) return requested;

  const standard = Math.ceil(oversPerInnings / 5);
  return bowlingSquadSize * standard >= oversPerInnings ? standard : null;
}

/**
 * The three openers are in the two squads that are actually playing.
 *
 * The client filters its dropdowns, but a request can be crafted directly, so
 * this is re-checked server-side — and a Zod schema cannot do it, because it
 * needs a database round trip.
 *
 * Shared by both innings, which is the point. It was inline in
 * `createMatchWithFirstInnings` and simply absent from `startSecondInnings`,
 * so a chase could be opened with batters from the fielding side, or with
 * player ids belonging to another user entirely — who would then appear on
 * that player's public career page, having never been at the ground.
 */
function assertOpenersInSquads(
  battingSquad: { id: string }[],
  bowlingSquad: { id: string }[],
  openers: { openingStrikerId: string; openingNonStrikerId: string; openingBowlerId: string },
): void {
  const inBattingSquad = (id: string) => battingSquad.some((p) => p.id === id);
  const inBowlingSquad = (id: string) => bowlingSquad.some((p) => p.id === id);

  if (!inBattingSquad(openers.openingStrikerId) || !inBattingSquad(openers.openingNonStrikerId)) {
    throw invalid('Opening batters must be in the batting squad', 'openingStrikerId');
  }
  if (!inBowlingSquad(openers.openingBowlerId)) {
    throw invalid('The opening bowler must be in the bowling squad', 'openingBowlerId');
  }
}

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
  assertOpenersInSquads(battingSquad, bowlingSquad, input);

  const match = await createMatch({
    title: input.title,
    venue: input.venue,
    oversPerInnings: input.oversPerInnings,
    format: input.format,
    // Both playing conditions are sized from the squads that are already
    // loaded above, because this is the only place that knows them.
    maxOversPerBowler: sizeBowlerQuota(
      input.maxOversPerBowler,
      input.oversPerInnings,
      bowlingSquad.length,
    ),
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
    maxWickets: sizeMaxWickets(battingSquad.length),
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

  // The sides swap: whoever bowled the first innings now bats. Both squads are
  // needed — one to size the innings, both to check the openers really belong
  // to the teams playing this match.
  const [chasingSquad, defendingSquad] = await Promise.all([
    getTeamMembers(first.bowlingTeamId),
    getTeamMembers(first.battingTeamId),
  ]);
  assertOpenersInSquads(chasingSquad, defendingSquad, input);

  const inning = await createInning({
    matchId: match.id,
    inningsNumber: 2,
    battingTeamId: first.bowlingTeamId,
    bowlingTeamId: first.battingTeamId,
    target: first.runs + 1,
    openingStrikerId: input.openingStrikerId,
    openingNonStrikerId: input.openingNonStrikerId,
    openingBowlerId: input.openingBowlerId,
    maxWickets: sizeMaxWickets(chasingSquad.length),
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
 *
 * Idempotent on double-submit, like `startSecondInnings`. The button lives on
 * the mandatory next-batter sheet, so it gets tapped by someone who has just
 * been told their innings is over — a second tap must not surface "No innings
 * is in progress" on the innings-break screen that follows.
 */
export async function endCurrentInnings(matchId: string) {
  const { match } = await requireOwnedMatch(matchId);

  const allInnings = await getInnings(matchId);
  const current = allInnings.find((i) => i.status === 'in_progress');

  if (!current) {
    // Nothing in progress means the innings is already closed — the caller's
    // desired state. Report the most recent one rather than failing.
    const last = allInnings[allInnings.length - 1];
    if (!last) throw invalid('This match has no innings yet');
    return { match, inning: last, alreadyEnded: true as const };
  }

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

  return { match, inning: current, alreadyEnded: false as const };
}

/**
 * Abandon a match: rain, a dispute, or one started by mistake.
 *
 * Deliberately not a result. A no-result is a real outcome in cricket and is
 * not the same as a tie, so it is recorded as one rather than faked as a
 * scoreline nobody played to.
 *
 * Also the way out of a dead end: a live match could not be deleted, and the
 * error told the caller to "finish or abandon" it while offering no way to do
 * either. Once abandoned it is no longer live, so deletion works unchanged.
 *
 * Idempotent, like the other lifecycle calls here — the button gets tapped
 * twice by someone standing in the rain.
 */
export async function abandonOwnedMatch(matchId: string, reason?: string) {
  const { match } = await requireOwnedMatch(matchId);

  if (match.status === 'abandoned') {
    return { match, alreadyAbandoned: true as const };
  }
  if (match.status === 'completed') {
    throw invalid('This match already has a result. Delete it instead.');
  }

  const summary = reason?.trim() ? `Match abandoned — ${reason.trim()}` : 'Match abandoned';
  await abandonMatch(matchId, summary);

  const updated = await getMatch(matchId);
  return { match: updated ?? match, alreadyAbandoned: false as const };
}

/** Delete a match and everything scored in it. Blocked while it's live. */
export async function deleteOwnedMatch(matchId: string) {
  const { match, userId } = await requireOwnedMatch(matchId);

  // Racing the auto-complete-on-chase-win logic corrupts the result, so a
  // live match must be finished or abandoned first. Until `abandonOwnedMatch`
  // existed this named an action there was no way to perform, which made a
  // mistaken match permanent.
  if (match.status === 'live') {
    throw invalid('Finish or abandon the match before deleting it');
  }

  await deleteMatch(matchId, userId);
}
