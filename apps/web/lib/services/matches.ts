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
  OpenersInput,
  StartNextInningsInput,
  UpdateMatchInput,
} from '@open-innings/shared';
import { resolveBattingSides } from '@open-innings/shared';
import { SUPER_OVER_MAX_WICKETS, replayInnings } from '@open-innings/scoring';
import type { Innings } from '@/lib/db/schema';
import {
  createMatchOnce,
  createInning,
  closeOpenInnings,
  startMatch,
  updateInningCache,
  getTeamMembers,
  getMatchSquad,
  setMatchSquad,
  type SquadMember,
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
import { toBallEventInputs } from '@/lib/ball-input';
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
 * Max wickets a side can lose (squad size - 1, capped at 10).
 */
export function sizeMaxWickets(squadSize: number): number {
  return Math.min(10, Math.max(1, squadSize - 1));
}

/**
 * Determine per-bowler over limit.
 * Defaults to a fifth of the innings if the squad is large enough to bowl it.
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
 * Ensure opening batters and bowler belong to the correct playing squads.
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

/**
 * Every named player has to be on the club's books.
 *
 * The XI is a subset of the roster, not a second way to add people to it.
 * Without this an owner could name any player id they could see — and
 * `GET /api/teams/[id]/club` is public and returns real ids — putting a
 * stranger's career figures inside their match. `addPlayerToTeam` already
 * makes the same check for the roster itself; this is the same rule one level
 * down.
 */
function assertSquadInRoster(
  roster: { id: string }[],
  named: string[] | undefined,
  field: string,
): void {
  if (named === undefined) return;
  const onTheBooks = new Set(roster.map((p) => p.id));
  for (const id of named) {
    if (!onTheBooks.has(id)) {
      throw invalid('Everyone in the XI must be in that club’s squad', field);
    }
  }
}

/**
 * The side that is actually playing, out of the club's whole roster.
 *
 * Exported for tests, like `sizeMaxWickets` and `sizeBowlerQuota` below it —
 * and for the same reason. It is pure, it is the input to both of them, and
 * getting it wrong is invisible until an innings will not end.
 *
 * Order follows the roster rather than the order the ids arrived in. The
 * batting order the client sent is stored on `match_squads` and read back from
 * there; this function answers "who", not "in what order", and taking the
 * client's order here would give the two different answers.
 */
export function resolvePlayingXI<T extends { id: string }>(
  named: string[] | undefined,
  roster: T[],
): T[] {
  // Undefined is not an empty side — it is a match where nobody said, which
  // every match before migration 0018 is. See `squadFor`.
  if (named === undefined) return roster;
  const chosen = new Set(named);
  return roster.filter((p) => chosen.has(p.id));
}

/**
 * Who is playing for this side, as far as anyone recorded.
 *
 * The XI where one was named, and the whole roster where none was. That
 * fallback is the compatibility contract from migration 0018: matches created
 * before `match_squads` existed have no rows, and inventing an XI for them
 * from a roster would be a guess about who turned up. Reading absence as "the
 * whole roster" is exactly the behaviour they were scored under, so their
 * replays are unchanged.
 */
export async function squadFor(matchId: string, teamId: string): Promise<SquadMember[]> {
  const named = await getMatchSquad(matchId, teamId);
  return named.length > 0 ? named : await getTeamMembers(teamId);
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
 */
export async function createMatchWithFirstInnings(input: CreateMatchInput) {
  const userId = await getUserId();
  if (!userId) throw unauthorized('Sign in to create a match');

  /*
   * Both sides have to be yours.
   *
   * Nothing checked this. The schema refuses two identical teams and insists
   * the toss winner is one of them; `createMatch` stamps `created_by` from
   * the session and never looks at the teams at all. So any signed-in account
   * could name two clubs it had no relationship with and score a full match
   * between them.
   *
   * That is not a hypothetical, because the reconnaissance is free:
   * `GET /api/teams/[id]/club` needs no session and returns the squad with
   * real player ids. The result appears on both clubs' public pages —
   * `clubPageFor` selects on team id with no owner filter — and every
   * invented delivery lands in those players' public career figures. The
   * victims cannot remove it either, since deletion requires `created_by`.
   *
   * Reported as not-found rather than forbidden, matching the convention in
   * errors.ts: a team id you do not own should not be confirmable by the
   * shape of the refusal.
   */
  const [teamA, teamB] = await Promise.all([getTeam(input.teamAId), getTeam(input.teamBId)]);
  if (!teamA || teamA.ownerId !== userId) throw notFound('Team not found');
  if (!teamB || teamB.ownerId !== userId) throw notFound('Team not found');

  const { battingTeamId, bowlingTeamId } = resolveBattingSides(
    input.teamAId,
    input.teamBId,
    input.tossWinnerTeamId,
    input.tossDecision,
  );

  /*
   * The XI, resolved before the match exists.
   *
   * It has to happen here rather than after `createMatch`, because both
   * playing conditions below are sized from squad length — and sizing them
   * from the club's whole roster is the bug migration 0018 exists to end. A
   * seven-a-side game played out of a twelve-player roster was given ten
   * wickets and could not end the way it was played.
   *
   * The rosters are loaded either way: they are what the named XI is checked
   * against, and what stands in for it when none was named.
   */
  const [teamARoster, teamBRoster] = await Promise.all([
    getTeamMembers(input.teamAId),
    getTeamMembers(input.teamBId),
  ]);
  assertSquadInRoster(teamARoster, input.teamAPlayerIds, 'teamAPlayerIds');
  assertSquadInRoster(teamBRoster, input.teamBPlayerIds, 'teamBPlayerIds');

  const teamASquad = resolvePlayingXI(input.teamAPlayerIds, teamARoster);
  const teamBSquad = resolvePlayingXI(input.teamBPlayerIds, teamBRoster);

  // Which of the two bats is the toss's answer, resolved above. The client
  // names squads per team precisely so it never has to work this out.
  const aIsBatting = battingTeamId === input.teamAId;
  const battingSquad = aIsBatting ? teamASquad : teamBSquad;
  const bowlingSquad = aIsBatting ? teamBSquad : teamASquad;

  // Only when the match is starting now. A scheduled one has no openers yet,
  // and the check runs again when it is started.
  if (input.openingStrikerId && input.openingNonStrikerId && input.openingBowlerId) {
    assertOpenersInSquads(battingSquad, bowlingSquad, {
      openingStrikerId: input.openingStrikerId,
      openingNonStrikerId: input.openingNonStrikerId,
      openingBowlerId: input.openingBowlerId,
    });
  }

  const created = await createMatchOnce({
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
    scheduledAt: input.scheduledAt,
  });
  if (!created) throw unauthorized('Could not create match — sign in first');
  const { match, deduped } = created;

  /*
   * The retry won. This request is a repeat of one that already created this
   * match — a double tap, or a resend after a timeout — and everything the
   * original went on to do (squads, going live, opening the innings) is done
   * too. Returning the match as it stands is the idempotent answer; running
   * the rest again would either fail on the unique innings index or open a
   * second innings.
   */
  if (deduped) {
    const innings = await getInnings(match.id);
    return { match, inning: innings.find((i) => i.status === 'in_progress') ?? null };
  }

  /*
   * Store the XI now the match has an id to hang it on.
   *
   * Only where one was actually named. Writing the whole roster in when it was
   * not would turn "nobody said" into "these eleven played", which is a claim
   * nobody made — and it would then drift from the roster it was copied from
   * the next time somebody joined the club.
   *
   * Captaincy and keeping default to the club's answer. They are per-match
   * facts and a later edit can change them, but on the day the side is named
   * the club's captain is the likeliest captain.
   */
  const rolesFrom = (roster: SquadMember[]) =>
    new Map(
      roster.map((p) => [p.id, { isCaptain: p.isCaptain, isWicketkeeper: p.isWicketkeeper }]),
    );

  if (input.teamAPlayerIds) {
    await setMatchSquad(match.id, input.teamAId, input.teamAPlayerIds, rolesFrom(teamARoster));
  }
  if (input.teamBPlayerIds) {
    await setMatchSquad(match.id, input.teamBId, input.teamBPlayerIds, rolesFrom(teamBRoster));
  }

  /*
   * A match set up for later stops here.
   *
   * It has its sides, its XIs and its toss if one was made, and no innings —
   * because an innings needs openers and nobody knows on Friday who is opening
   * on Saturday. `openFirstInnings` finishes the job at the ground.
   *
   * The status stays `scheduled`, which is what `createMatch` defaults to, so
   * this is a matter of *not* calling `startMatch` rather than of setting
   * anything.
   */
  if (input.scheduledAt) {
    const scheduled = await getMatch(match.id);
    return { match: scheduled ?? match, inning: null };
  }

  await startMatch(match.id);

  const inning = await createInning({
    matchId: match.id,
    inningsNumber: 1,
    battingTeamId,
    bowlingTeamId,
    openingStrikerId: input.openingStrikerId!,
    openingNonStrikerId: input.openingNonStrikerId!,
    openingBowlerId: input.openingBowlerId!,
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
 * Open the next innings (the chase or a super over). Idempotent.
 */
/**
 * Open innings 1 of a match that was set up for later.
 *
 * `startNextInnings` cannot do this: it exists to work out which innings comes
 * next from the ones already played, and refuses when the first has not
 * finished. There is no first here at all.
 *
 * Everything else is the same as creating a live match — the toss decides the
 * sides, the XI sizes the innings — so it reads from the stored squads rather
 * than re-deriving anything, which is the whole reason setting up in advance
 * is worth doing.
 */
export async function openFirstInnings(matchId: string, input: OpenersInput) {
  const { match } = await requireOwnedMatch(matchId);

  const existing = await getInnings(matchId);
  const first = existing.find((i) => i.inningsNumber === 1);
  // Idempotent, like the endpoint it shares. Two taps on "start" must not
  // produce two innings.
  if (first) return { inning: first, alreadyExisted: true as const };

  const { battingTeamId, bowlingTeamId } = resolveBattingSides(
    match.teamAId,
    match.teamBId,
    match.tossWinnerTeamId ?? undefined,
    (match.tossDecision ?? undefined) as 'bat' | 'bowl' | undefined,
  );

  const [battingSquad, bowlingSquad] = await Promise.all([
    squadFor(match.id, battingTeamId),
    squadFor(match.id, bowlingTeamId),
  ]);
  assertOpenersInSquads(battingSquad, bowlingSquad, input);

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

  await startMatch(match.id);
  await updateInningCache(inning.id, { status: 'in_progress', startedAt: new Date() });

  const fresh = await getInning(inning.id);
  return { inning: fresh ?? inning, alreadyExisted: false as const };
}

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
  // belong to the teams playing this match. The XI where the match named one
  // — the second innings is sized from the side that is actually batting it,
  // not from whoever the club has on its books.
  const [battingSquad, bowlingSquad] = await Promise.all([
    squadFor(match.id, battingTeamId),
    squadFor(match.id, bowlingTeamId),
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
 * Update match details.
 * Changing playing conditions (like oversPerInnings) triggers a replay of all innings.
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
    const allInnings = await getInnings(matchId);
    const lastInning = allInnings[allInnings.length - 1];
    const freshMatch = (await getMatch(matchId)) ?? match;
    if (
      lastInning &&
      lastInning.inningsNumber >= 2 &&
      lastInning.status === 'completed' &&
      lastInning.target != null &&
      freshMatch.status === 'live'
    ) {
      const result = computeMatchResult({
        runs: lastInning.runs,
        wickets: lastInning.wickets,
        target: lastInning.target,
        maxWickets: lastInning.maxWickets,
        battingTeamId: lastInning.battingTeamId,
        bowlingTeamId: lastInning.bowlingTeamId,
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
        summary: formatMatchResult(result, winner?.name, {
          superOver: lastInning.inningsNumber >= 3,
        }),
      });
    }
  }

  return (await getMatch(matchId)) ?? match;
}

/**
 * Replay every innings of a match and update cached totals based on ball events.
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
      // One mapper for every replay — see lib/ball-input.ts.
      toBallEventInputs(balls),
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
 * Close the innings in progress. Settles the match if it's a chase. Idempotent.
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

  /*
   * Close it under the innings row's lock and take the row back from the
   * transaction that closed it.
   *
   * This used to mark the innings completed from the row as read, then compute
   * the result from that same stale read. A delivery or correction landing in
   * between stored a result the ball log contradicts — "won by 3" on the share
   * card, 2 on the log. `closeOpenInnings` re-reads the row inside the
   * transaction that closes it, so the figures the result is computed from are
   * the figures on disk, and no delivery can land afterwards (the innings is
   * closed, and `recordBall` refuses closed innings under the same lock).
   */
  const closed = await closeOpenInnings(matchId);
  if (!closed) {
    // Lost the race: another device ended the innings, or the match was
    // abandoned, between the read above and now. Either way the caller's
    // desired state already holds — report it as already ended.
    const fresh = await getInnings(matchId);
    const last = fresh[fresh.length - 1];
    if (!last) throw invalid('This match has no innings yet');
    return { match, inning: last, alreadyEnded: true as const };
  }

  if (closed.inningsNumber >= 2 && closed.target != null) {
    const result = computeMatchResult({
      runs: closed.runs,
      wickets: closed.wickets,
      target: closed.target,
      maxWickets: closed.maxWickets,
      battingTeamId: closed.battingTeamId,
      bowlingTeamId: closed.bowlingTeamId,
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
      summary: formatMatchResult(result, winner?.name, { superOver: closed.inningsNumber >= 3 }),
    });
  }

  return { match, inning: closed, alreadyEnded: false as const };
}

/**
 * Abandon a match (e.g. rain). Records as a no-result. Idempotent.
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
