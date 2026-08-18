/**
 * Open Innings — typed DB query helpers.
 *
 * Server-only. These wrap Drizzle queries for the routes/server actions.
 * All return Promises. All handle auth via `getServerUser()`.
 */

import 'server-only';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../client';
import {
  players,
  teams,
  teamMembers,
  matches,
  innings as inningsTable,
  ballEvents,
  type Player,
  type Team,
  type Match,
  type Innings,
  type BallEvent,
} from '../schema';
import { getUserId } from '@/lib/auth/local';

// ─────────────────────────────────────────────────────────────────────────────
// Players
// ─────────────────────────────────────────────────────────────────────────────

export async function listPlayers(): Promise<Player[]> {
  const userId = await getUserId();
  if (!userId) return [];
  return db
    .select()
    .from(players)
    .where(eq(players.createdBy, userId))
    .orderBy(asc(players.fullName));
}

export async function getPlayer(id: string): Promise<Player | null> {
  const rows = await db.select().from(players).where(eq(players.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createPlayer(input: {
  fullName: string;
  shortName?: string;
  dateOfBirth?: string;
  battingStyle?: 'right_hand' | 'left_hand';
  bowlingStyle?:
    | 'right_arm_fast'
    | 'left_arm_fast'
    | 'right_arm_medium'
    | 'left_arm_medium'
    | 'right_arm_spin'
    | 'left_arm_spin'
    | 'right_arm_off_break'
    | 'left_arm_orthodox'
    | 'leg_break'
    | 'googly'
    | 'none';
  role?: 'batsman' | 'bowler' | 'all_rounder' | 'wicket_keeper' | 'wicket_keeper_batsman';
}): Promise<Player | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const rows = await db
    .insert(players)
    .values({
      fullName: input.fullName,
      shortName: input.shortName,
      dateOfBirth: input.dateOfBirth,
      battingStyle: input.battingStyle,
      bowlingStyle: input.bowlingStyle,
      role: input.role,
      createdBy: userId,
    })
    .returning();
  return rows[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Teams
// ─────────────────────────────────────────────────────────────────────────────

export async function listTeams(): Promise<Team[]> {
  const userId = await getUserId();
  if (!userId) return [];
  return db.select().from(teams).where(eq(teams.ownerId, userId)).orderBy(asc(teams.name));
}

export async function getTeam(id: string): Promise<Team | null> {
  const rows = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * A player, plus the two facts that belong to their **membership** rather than
 * to them.
 *
 * Captaincy and keeping are per-squad: the same person captains one club and
 * bats at six for another, so these live on `team_members` and not on
 * `players`. They ride along here because every caller of this function is
 * asking "who is in this squad", and that question is not fully answered
 * without them.
 */
export type SquadMember = Player & {
  isCaptain: boolean;
  isWicketkeeper: boolean;
};

export async function getTeamMembers(teamId: string): Promise<SquadMember[]> {
  return (
    db
      .select({
        id: players.id,
        userId: players.userId,
        fullName: players.fullName,
        shortName: players.shortName,
        dateOfBirth: players.dateOfBirth,
        battingStyle: players.battingStyle,
        bowlingStyle: players.bowlingStyle,
        role: players.role,
        avatarUrl: players.avatarUrl,
        createdBy: players.createdBy,
        createdAt: players.createdAt,
        updatedAt: players.updatedAt,
        isCaptain: teamMembers.isCaptain,
        isWicketkeeper: teamMembers.isWicketkeeper,
      })
      .from(teamMembers)
      .innerJoin(players, eq(teamMembers.playerId, players.id))
      .where(eq(teamMembers.teamId, teamId))
      // Captain first, then the keeper, then everyone alphabetically. A squad
      // list is read to find those two more often than to find a name.
      .orderBy(desc(teamMembers.isCaptain), desc(teamMembers.isWicketkeeper), asc(players.fullName))
  );
}

export async function createTeam(input: {
  name: string;
  shortName?: string;
  homeGround?: string;
}): Promise<Team | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const rows = await db
    .insert(teams)
    .values({
      name: input.name,
      shortName: input.shortName,
      homeGround: input.homeGround,
      ownerId: userId,
    })
    .returning();
  return rows[0] ?? null;
}

export async function addPlayerToTeam(teamId: string, playerId: string): Promise<void> {
  await db.insert(teamMembers).values({ teamId, playerId }).onConflictDoNothing();
}

export async function removeTeamMember(teamId: string, playerId: string): Promise<void> {
  await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.playerId, playerId)));
}

/** Rename or update a team's details. Scoped to the owner — a no-op otherwise. */
export async function updateTeam(
  id: string,
  userId: string,
  patch: { name?: string; shortName?: string; homeGround?: string },
): Promise<void> {
  await db
    .update(teams)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(teams.id, id), eq(teams.ownerId, userId)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Matches
// ─────────────────────────────────────────────────────────────────────────────

export async function listMatches(): Promise<Match[]> {
  const userId = await getUserId();
  if (!userId) return [];
  return db
    .select()
    .from(matches)
    .where(eq(matches.createdBy, userId))
    .orderBy(desc(matches.createdAt));
}

export async function getMatch(id: string): Promise<Match | null> {
  const rows = await db.select().from(matches).where(eq(matches.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createMatch(input: {
  title?: string;
  venue?: string;
  oversPerInnings: number;
  format?: string;
  /** Null means the match sets no per-bowler limit. See migration 0009. */
  maxOversPerBowler?: number | null;
  teamAId: string;
  teamBId: string;
  tossWinnerTeamId?: string;
  tossDecision?: 'bat' | 'bowl';
  scheduledAt?: Date;
}): Promise<Match | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const rows = await db
    .insert(matches)
    .values({
      title: input.title,
      venue: input.venue,
      oversPerInnings: input.oversPerInnings,
      format: input.format,
      maxOversPerBowler: input.maxOversPerBowler,
      teamAId: input.teamAId,
      teamBId: input.teamBId,
      tossWinnerTeamId: input.tossWinnerTeamId,
      tossDecision: input.tossDecision,
      scheduledAt: input.scheduledAt,
      createdBy: userId,
      status: 'scheduled',
    })
    .returning();
  return rows[0] ?? null;
}

export async function startMatch(matchId: string): Promise<void> {
  await db
    .update(matches)
    .set({ status: 'live', startedAt: new Date(), updatedAt: new Date() })
    .where(eq(matches.id, matchId));
}

/** Mark a match finished and record its result. */
export async function completeMatch(
  matchId: string,
  patch: {
    result: 'team_a_win' | 'team_b_win' | 'tie';
    winningTeamId: string | null;
    summary: string;
  },
): Promise<void> {
  await db
    .update(matches)
    .set({
      status: 'completed',
      completedAt: new Date(),
      updatedAt: new Date(),
      result: patch.result,
      winningTeamId: patch.winningTeamId,
      summary: patch.summary,
    })
    .where(eq(matches.id, matchId));
}

/**
 * Abandon a match — rain, a dispute, or one created by mistake.
 *
 * The two enum values this writes have existed since the first migration and
 * had never been used: `matches.status` has carried 'abandoned' and
 * `matches.result` has carried 'no_result' the whole time, while
 * `completeMatch` accepted only a win or a tie. So the only way out of 'live'
 * was to finish a chase, and a match that could not be finished stayed live
 * forever — which also made it undeletable, because `deleteOwnedMatch` refuses
 * while a match is live and told the caller to "abandon" it.
 *
 * Any innings still in progress is closed in the same transaction. Leaving one
 * open would keep the match in `loadMatchInProgress`, so the scorer console
 * would still offer to take deliveries for a match that is over.
 */
export async function abandonMatch(matchId: string, summary: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(matches)
      .set({
        status: 'abandoned',
        result: 'no_result',
        winningTeamId: null,
        summary,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(matches.id, matchId));

    await tx
      .update(inningsTable)
      .set({ status: 'completed', completedAt: new Date() })
      .where(and(eq(inningsTable.matchId, matchId), eq(inningsTable.status, 'in_progress')));
  });
}

/** Revert a completed match to live (used when the final ball is undone). */
export async function reopenMatch(matchId: string): Promise<void> {
  await db
    .update(matches)
    .set({
      status: 'live',
      completedAt: null,
      updatedAt: new Date(),
      result: null,
      winningTeamId: null,
      summary: null,
    })
    .where(eq(matches.id, matchId));
}

/**
 * Delete a match and everything scored in it. Scoped to the owner.
 * `innings.matchId` and `ball_events.inningsId` both cascade on delete, so
 * this one statement is enough — no manual cleanup of innings/ball_events.
 */
export async function deleteMatch(matchId: string, userId: string): Promise<void> {
  await db.delete(matches).where(and(eq(matches.id, matchId), eq(matches.createdBy, userId)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Innings
// ─────────────────────────────────────────────────────────────────────────────

export async function getInnings(matchId: string): Promise<Innings[]> {
  return db
    .select()
    .from(inningsTable)
    .where(eq(inningsTable.matchId, matchId))
    .orderBy(asc(inningsTable.inningsNumber));
}

export async function getInning(id: string): Promise<Innings | null> {
  const rows = await db.select().from(inningsTable).where(eq(inningsTable.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createInning(input: {
  matchId: string;
  inningsNumber: 1 | 2 | 3 | 4;
  battingTeamId: string;
  bowlingTeamId: string;
  target?: number;
  openingStrikerId?: string;
  openingNonStrikerId?: string;
  openingBowlerId?: string;
  maxWickets?: number;
}): Promise<Innings | null> {
  const rows = await db
    .insert(inningsTable)
    .values({
      matchId: input.matchId,
      inningsNumber: input.inningsNumber,
      battingTeamId: input.battingTeamId,
      bowlingTeamId: input.bowlingTeamId,
      target: input.target,
      openingStrikerId: input.openingStrikerId,
      openingNonStrikerId: input.openingNonStrikerId,
      openingBowlerId: input.openingBowlerId,
      // A last-resort fallback, not the rule. The caller knows the squad and
      // should size this from it — a six-a-side team cannot lose ten wickets,
      // and an innings that can never end that way runs to the over limit with
      // nobody left to bat. See sizeMaxWickets in lib/services/matches.ts.
      maxWickets: input.maxWickets ?? (input.inningsNumber >= 3 ? 2 : 10),
      status: 'not_started',
    })
    .returning();
  return rows[0] ?? null;
}

export async function updateInningCache(
  inningsId: string,
  patch: {
    runs?: number;
    wickets?: number;
    ballsBowled?: number;
    extras?: number;
    status?: 'not_started' | 'in_progress' | 'completed';
    startedAt?: Date;
    completedAt?: Date;
  },
): Promise<void> {
  await db.update(inningsTable).set(patch).where(eq(inningsTable.id, inningsId));
}

// ─────────────────────────────────────────────────────────────────────────────
// Ball events — the source of truth
// ─────────────────────────────────────────────────────────────────────────────

export type BallEventInsert = Omit<BallEvent, 'id' | 'createdAt' | 'createdBy'>;

/**
 * Insert a delivery on its own, without touching the innings cache.
 *
 * @deprecated Prefer `recordBall`, which does both in one transaction.
 *
 * Kept because a caller that genuinely wants only the row is plausible — a
 * backfill or an import would. But the ball endpoint used this and then
 * updated the cache separately, and a failure between the two left the score
 * a delivery behind with nothing to recompute it. Reach for `recordBall`
 * unless you have thought about that and decided it does not apply.
 */
export async function insertBallEvent(input: BallEventInsert): Promise<BallEvent | null> {
  const userId = await getUserId();
  if (!userId) {
    throw new Error('Unauthorized: ball events require a signed-in user');
  }
  const rows = await db
    .insert(ballEvents)
    .values({
      ...input,
      createdBy: userId,
    })
    .returning();
  return rows[0] ?? null;
}

/**
 * Record a delivery and move the innings on, in one transaction.
 *
 * These were two awaits in the route: insert the ball, then update the
 * innings' cached runs/wickets/balls/extras. Anything failing between them —
 * a dropped connection at a ground, a dyno restart mid-request — left the
 * ball stored and the cache a delivery behind, and nothing recomputes the
 * cache except the next successful ball.
 *
 * The unique index on (innings_id, ball_number) is what makes this matter
 * rather than merely being tidy: a duplicate submission now raises inside the
 * transaction, and the cache update rolls back with it instead of being
 * applied twice for a ball that was written once.
 */
export async function recordBall(
  input: BallEventInsert,
  inningsId: string,
  cache: {
    runs: number;
    wickets: number;
    ballsBowled: number;
    extras: number;
    status: 'not_started' | 'in_progress' | 'completed';
    completedAt?: Date;
  },
): Promise<BallEvent | null> {
  const userId = await getUserId();
  if (!userId) {
    throw new Error('Unauthorized: ball events require a signed-in user');
  }

  return db.transaction(async (tx) => {
    const rows = await tx
      .insert(ballEvents)
      .values({ ...input, createdBy: userId })
      .returning();

    await tx.update(inningsTable).set(cache).where(eq(inningsTable.id, inningsId));

    return rows[0] ?? null;
  });
}

export async function listBallEvents(inningsId: string): Promise<BallEvent[]> {
  return db
    .select()
    .from(ballEvents)
    .where(eq(ballEvents.inningsId, inningsId))
    .orderBy(asc(ballEvents.ballNumber));
}

export async function getBallEvent(id: string): Promise<BallEvent | null> {
  const rows = await db.select().from(ballEvents).where(eq(ballEvents.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function deleteBallEvent(id: string): Promise<void> {
  await db.delete(ballEvents).where(eq(ballEvents.id, id));
}

/**
 * Undo a delivery and move the innings back, in one transaction.
 *
 * The mirror of `recordBall`, and it exists for the same reason. The undo path
 * used to delete the ball and then update the cached score as two separate
 * awaits, so anything failing between them — a dropped connection at a ground,
 * a dyno restart — left the delivery gone and the cache a ball ahead, with
 * nothing to recompute it but the next successful delivery.
 *
 * **Deletes by id rather than "whichever is last".** The caller has already
 * replayed the innings without this specific ball to produce `cache`, so
 * deleting a different one would apply a score that does not describe the
 * remaining deliveries. Two overlapping undos now leave the second with
 * nothing to delete, and it is refused instead of quietly eating two balls.
 *
 * `reopenMatchId` closes the last gap: undoing the winning run of a chase has
 * to reopen the match, and that was a third write outside the pair.
 */
export async function removeLastBall(
  ballId: string,
  inningsId: string,
  cache: {
    runs: number;
    wickets: number;
    ballsBowled: number;
    extras: number;
    status: 'not_started' | 'in_progress' | 'completed';
  },
  opts: { reopenMatchId?: string } = {},
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(ballEvents)
      .where(eq(ballEvents.id, ballId))
      .returning({ id: ballEvents.id });

    // Somebody else undid it first. Report it rather than writing a score
    // computed against a ball that is no longer there.
    if (deleted.length === 0) return false;

    await tx
      .update(inningsTable)
      .set({ ...cache, completedAt: cache.status === 'completed' ? new Date() : null })
      .where(eq(inningsTable.id, inningsId));

    if (opts.reopenMatchId) {
      await tx
        .update(matches)
        .set({
          status: 'live',
          completedAt: null,
          updatedAt: new Date(),
          result: null,
          winningTeamId: null,
          summary: null,
        })
        .where(eq(matches.id, opts.reopenMatchId));
    }

    return true;
  });
}

/**
 * @deprecated Prefer `removeLastBall`, which also moves the innings back.
 *
 * Deleting the row on its own leaves the cached score a delivery ahead, and
 * nothing recomputes it until the next successful ball.
 */
export async function deleteLastBallEvent(inningsId: string): Promise<void> {
  const last = await db
    .select()
    .from(ballEvents)
    .where(eq(ballEvents.inningsId, inningsId))
    .orderBy(desc(ballEvents.ballNumber))
    .limit(1);
  if (last[0]) {
    await db.delete(ballEvents).where(eq(ballEvents.id, last[0].id));
  }
}

/**
 * Load everything needed to render the scorer UI: the match, the current
 * innings row, and the ordered list of ball events.
 */
export async function loadMatchInProgress(matchId: string): Promise<{
  match: Match;
  currentInnings: Innings;
  balls: BallEvent[];
} | null> {
  const match = await getMatch(matchId);
  if (!match) return null;

  const allInnings = await getInnings(matchId);
  const currentInnings =
    allInnings.find((i) => i.status === 'in_progress') ??
    allInnings.find((i) => i.status === 'not_started') ??
    allInnings[allInnings.length - 1];
  if (!currentInnings) return null;

  const balls = await listBallEvents(currentInnings.id);

  return { match, currentInnings, balls };
}

// ─────────────────────────────────────────────────────────────────────────────
// Player name lookups (used by scorecard view)
// ─────────────────────────────────────────────────────────────────────────────

export async function getPlayerNamesByIds(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select({ id: players.id, fullName: players.fullName })
    .from(players)
    .where(inArray(players.id, ids));
  const out: Record<string, string> = {};
  for (const row of rows) out[row.id] = row.fullName;
  return out;
}
