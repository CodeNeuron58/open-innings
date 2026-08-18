/**
 * Match lifecycle, transport-free.
 *
 * Ownership is re-checked here rather than trusted from the caller — both the
 * web action and the REST handler route through these, and a rule enforced in
 * only one of them is a rule that isn't enforced.
 */
import 'server-only';
import type {
  CreateMatchInput,
  StartNextInningsInput,
  UpdateMatchInput,
} from '@open-innings/shared';
import { resolveBattingSides } from '@open-innings/shared';
import {
  SUPER_OVER_MAX_WICKETS,
  asInningsId,
  asPlayerId,
  replayInnings,
} from '@open-innings/scoring';
import type { Innings } from '@/lib/db/schema';
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
  reopenMatch,
  updateMatchDetails,
  listBallEvents,
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
 * Open the next innings: the chase, or a super over after a tie.
 *
 * One function rather than two, because every difference between them is
 * data. Which innings it is, which way round the sides go, and what the target
 * is are all read from what has already been played — the caller sends three
 * openers and nothing else, so there is no way to assert a state the match is
 * not in.
 *
 * Idempotent at every step. The innings break and the result screen are both
 * places a nervous second tap happens.
 */
export async function startNextInnings(matchId: string, input: StartNextInningsInput) {
  const { match } = await requireOwnedMatch(matchId);
  const allInnings = await getInnings(matchId);
  const at = (n: number) => allInnings.find((i) => i.inningsNumber === n);

  const first = at(1);
  const second = at(2);
  const third = at(3);
  const fourth = at(4);
  const played = (i?: Innings) => i?.status === 'completed';

  /*
   * Which innings comes next, and off which one.
   *
   * A super over is innings 3 and 4, and is refused unless the match is
   * genuinely tied — it is not something a scorer decides to have. Innings 3
   * bats the side that batted second in the match, which is the playing
   * condition, so the sides do **not** swap there as they do everywhere else.
   */
  let battingTeamId: string;
  let bowlingTeamId: string;
  let inningsNumber: 2 | 3 | 4;
  let target: number | undefined;

  if (!second) {
    if (!first || !played(first)) throw invalid('The first innings has not finished yet');
    battingTeamId = first.bowlingTeamId;
    bowlingTeamId = first.battingTeamId;
    inningsNumber = 2;
    target = first.runs + 1;
  } else if (!third) {
    if (!played(second)) return { match, inning: second, alreadyExisted: true as const };
    if (match.result !== 'tie') {
      throw invalid('A Super Over is only played when the scores are level');
    }
    battingTeamId = second.battingTeamId;
    bowlingTeamId = second.bowlingTeamId;
    inningsNumber = 3;
    target = undefined;
  } else if (!fourth) {
    if (!played(third)) return { match, inning: third, alreadyExisted: true as const };
    battingTeamId = third.bowlingTeamId;
    bowlingTeamId = third.battingTeamId;
    inningsNumber = 4;
    target = third.runs + 1;
  } else {
    /*
     * A tied super over is replayed in the professional game. Innings are
     * capped at four — see migration 0010 — so this returns the last one
     * rather than failing on a constraint the caller cannot see. Repeat super
     * overs are a real gap, and one worth naming rather than crashing into.
     */
    return { match, inning: fourth, alreadyExisted: true as const };
  }

  // Both squads: one to size the innings, both to check the openers really
  // belong to the teams playing this match.
  const [battingSquad, bowlingSquad] = await Promise.all([
    getTeamMembers(battingTeamId),
    getTeamMembers(bowlingTeamId),
  ]);
  assertOpenersInSquads(battingSquad, bowlingSquad, input);

  /*
   * A super over is two wickets, and still no more than the side has players
   * for. Its length needs no storing: the engine caps innings 3 and 4 at one
   * over from the innings number alone.
   */
  const squadWickets = sizeMaxWickets(battingSquad.length);
  const maxWickets =
    inningsNumber >= 3 ? Math.min(SUPER_OVER_MAX_WICKETS, squadWickets) : squadWickets;

  const inning = await createInning({
    matchId: match.id,
    inningsNumber,
    battingTeamId,
    bowlingTeamId,
    target,
    openingStrikerId: input.openingStrikerId,
    openingNonStrikerId: input.openingNonStrikerId,
    openingBowlerId: input.openingBowlerId,
    maxWickets,
  });
  if (!inning) throw new Error('Could not create the innings');

  await updateInningCache(inning.id, { status: 'in_progress', startedAt: new Date() });

  // The tie closed the match. A super over reopens it, or the ball endpoint
  // would refuse every delivery of the innings it was just asked to open.
  if (inningsNumber === 3) await reopenMatch(matchId);

  const fresh = await getMatch(matchId);
  return { match: fresh ?? match, inning, alreadyExisted: false as const };
}

/** @deprecated Use `startNextInnings`, which also opens a super over. */
export const startSecondInnings = startNextInnings;

/**
 * Change what a match says about itself.
 *
 * `oversPerInnings` is the one that is not cosmetic. The engine ends an
 * innings on it, so changing it re-decides whether an innings already scored
 * is over: shorten a twenty-over game to ten after twelve overs and that
 * innings finished two overs ago. The cached score would go on saying "in
 * progress" until the next delivery, which the engine would then refuse.
 *
 * So it is allowed only while the match is still being played, and every
 * innings is replayed afterwards. A finished match keeps its length —
 * re-deciding a result that has already been shared is a different feature
 * with a different name.
 */
export async function updateOwnedMatch(matchId: string, input: UpdateMatchInput) {
  const { match, userId } = await requireOwnedMatch(matchId);

  const lengthChanged =
    input.oversPerInnings !== undefined && input.oversPerInnings !== match.oversPerInnings;

  if (lengthChanged && match.status !== 'live' && match.status !== 'scheduled') {
    throw invalid(
      'The innings length can only be changed while the match is being played',
      'oversPerInnings',
    );
  }

  await updateMatchDetails(matchId, userId, input);

  if (lengthChanged || input.maxOversPerBowler !== undefined) {
    await recomputeInningsCaches(matchId);
  }

  return (await getMatch(matchId)) ?? match;
}

/**
 * Replay every innings of a match and write back what the deliveries say.
 *
 * The cached columns on `innings` are a read optimisation over the ball log,
 * and they stay correct because every write path recomputes them. Changing a
 * playing condition is the exception: it alters what the same deliveries mean
 * without adding one, so nothing would recompute until the next ball — and by
 * then the engine and the cache would disagree about whether the innings was
 * still open.
 *
 * A function rather than four lines inside its one caller, because ball
 * correction needs exactly this shape.
 */
export async function recomputeInningsCaches(matchId: string): Promise<void> {
  const match = await getMatch(matchId);
  if (!match) return;

  for (const inn of await getInnings(matchId)) {
    const balls = await listBallEvents(inn.id);
    const state = replayInnings(
      {
        matchId: match.id,
        oversPerInnings: match.oversPerInnings,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
        battingTeamId: inn.battingTeamId,
        bowlingTeamId: inn.bowlingTeamId,
        inningsId: inn.id,
        inningsNumber: inn.inningsNumber as 1 | 2 | 3 | 4,
        strikerId: inn.openingStrikerId ?? '',
        nonStrikerId: inn.openingNonStrikerId ?? '',
        bowlerId: inn.openingBowlerId ?? '',
        maxWickets: inn.maxWickets,
        target: inn.target ?? undefined,
        maxOversPerBowler: match.maxOversPerBowler ?? undefined,
      },
      balls.map((b) => ({
        ...b,
        inningsId: asInningsId(b.inningsId),
        batsmanId: asPlayerId(b.batsmanId),
        nonStrikerId: asPlayerId(b.nonStrikerId),
        bowlerId: asPlayerId(b.bowlerId),
        wicketPlayerId: b.wicketPlayerId ? asPlayerId(b.wicketPlayerId) : undefined,
        fielderId: b.fielderId ? asPlayerId(b.fielderId) : undefined,
        wicketType: b.wicketType ?? undefined,
        commentary: b.commentary ?? undefined,
      })),
    );

    await updateInningCache(inn.id, {
      runs: state.currentInnings.runs,
      wickets: state.currentInnings.wickets,
      ballsBowled: state.currentInnings.ballsBowled,
      extras: state.currentInnings.extras,
      status: state.currentInnings.status,
    });
  }
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
      // Nobody says a super over was won by seven runs.
      summary: formatMatchResult(result, winner?.name, { superOver: current.inningsNumber >= 3 }),
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
