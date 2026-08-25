/**
 * Open Innings — typed DB query helpers.
 *
 * Server-only. These wrap Drizzle queries for the routes/server actions.
 * All return Promises. All handle auth via `getServerUser()`.
 */

import 'server-only';
import { and, asc, desc, eq, inArray, ilike, or, sql } from 'drizzle-orm';
import { db } from '../client';
import {
  players,
  teams,
  teamMembers,
  matches,
  matchSquads,
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

/**
 * Find a player by name, optionally across every account.
 *
 * `listPlayers` scoped to `createdBy`, and that scoping is why a career could
 * not follow a person between clubs: two clubs scoring the same cricketer
 * created two rows and two half-careers with nothing able to join them. The
 * add-a-player screen was built on the premise that searching finds an
 * *existing* player, and the premise was false.
 *
 * Widening it discloses nothing new. Every career page at `/p/<id>` is
 * already public and unauthenticated — it is the thing people share, and the
 * reason to score at all. What this adds is the ability to find the page
 * before creating a second one.
 *
 * Two guards, and they are the reason this is a lookup rather than a
 * directory: a minimum query length enforced in the shared schema, and a
 * bounded limit. It fetches one more than asked so the caller can say "narrow
 * this" rather than silently truncating.
 */
export async function searchPlayersByName(
  q: string,
  scope: 'mine' | 'all',
  limit: number,
): Promise<{ rows: Player[]; truncated: boolean }> {
  const userId = await getUserId();
  // "Mine" with no session is empty rather than everything — the failure mode
  // of getting that backwards is disclosing every player in the system.
  if (scope === 'mine' && !userId) return { rows: [], truncated: false };

  // A name containing % or _ is a LIKE pattern otherwise, so a search for
  // "A_B" would match names it has no business matching.
  const term = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  const matchesName = or(ilike(players.fullName, term), ilike(players.shortName, term));

  const rows = await db
    .select()
    .from(players)
    .where(scope === 'mine' ? and(eq(players.createdBy, userId!), matchesName) : matchesName)
    .orderBy(asc(players.fullName))
    .limit(limit + 1);

  return { rows: rows.slice(0, limit), truncated: rows.length > limit };
}

/**
 * The squads each player has appeared for, newest first.
 *
 * Two cricketers share a name more often than a schema designer expects, and
 * runs alone do not tell them apart. The club does — "Arun Kumar, Rovers" is
 * the disambiguation a scorer actually uses.
 */
export async function clubsForPlayers(ids: string[]): Promise<Record<string, string[]>> {
  if (ids.length === 0) return {};

  const rows = await db
    .select({ playerId: teamMembers.playerId, name: teams.name })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(inArray(teamMembers.playerId, ids))
    .orderBy(desc(teamMembers.joinedAt));

  const out: Record<string, string[]> = {};
  for (const row of rows) {
    const list = (out[row.playerId] ??= []);
    if (list.length < 3 && !list.includes(row.name)) list.push(row.name);
  }
  return out;
}

/**
 * Fold one player row into another, everywhere at once.
 *
 * The repair for a duplicate that already exists. Every reference moves —
 * `ball_events` names a player in five separate columns, `team_members` in
 * one, and the innings' opening trio in three — and then the duplicate row
 * goes. In one transaction, because a half-done merge splits a career in a
 * way that is much harder to find than two obvious duplicates.
 *
 * **Refused when both players appear in the same innings.** Merging them
 * would put one person at both ends, or have them bowling to themselves. The
 * ball log would then describe a match that cannot happen, and every replay
 * of it — scorecard, career page, share card — would object forever.
 *
 * Returns null when the merge is not permitted, so the caller decides what to
 * tell whom; counts otherwise, so the client can say what moved.
 */
export async function mergePlayerInto(
  keepId: string,
  duplicateId: string,
  userId: string,
): Promise<{ ballEvents: number; squads: number; inningsOpenings: number } | null> {
  if (keepId === duplicateId) return null;

  return db.transaction(async (tx) => {
    const [keep] = await tx.select().from(players).where(eq(players.id, keepId)).limit(1);
    const [dupe] = await tx.select().from(players).where(eq(players.id, duplicateId)).limit(1);
    if (!keep || !dupe) return null;

    /*
     * You may only dissolve a row you created.
     *
     * The asymmetry is deliberate. Merging *into* someone else's player is
     * how a career gets joined up across clubs, and is the point. Merging
     * someone else's row *away* would let anyone erase another club's player
     * and redirect their history, which is the same power with none of the
     * legitimacy.
     */
    if (dupe.createdBy !== userId) return null;

    // A claimed row is a person who said "this is me". Folding that away
    // would silently detach them from their own career.
    if (dupe.userId && dupe.userId !== keep.userId) return null;

    /*
     * Refuse if both players appear in the same innings, in any role.
     *
     * This compared `batsman_id` to `batsman_id` and nothing else, which
     * caught only the case where both had batted. The rest of the merge
     * rewrites five columns, so the guard has to consider the same five or it
     * is checking a different question from the one the merge asks.
     *
     * The gap was reachable with an ordinary duplicate: survivor batted in an
     * innings, duplicate bowled in it. No two `batsman_id` values collide, the
     * guard passes, and the update below sets `bowler_id` to the survivor —
     * producing deliveries where the bowler is also the batsman. That is
     * exactly what `validateRoles` in the engine exists to reject. Replay is
     * tolerant, so the card still renders and nothing announces the damage,
     * but the duplicate row has been deleted in the same transaction and the
     * corruption is permanent.
     */
    const roleColumns = sql`
      unnest(array[a.batsman_id, a.non_striker_id, a.bowler_id,
                   a.wicket_player_id, a.fielder_id])
    `;
    const clash = await tx.execute<{ innings_id: string }>(sql`
      with roles as (
        select a.innings_id, ${roleColumns} as player_id
        from ball_events a
        where a.batsman_id in (${keepId}::uuid, ${duplicateId}::uuid)
           or a.non_striker_id in (${keepId}::uuid, ${duplicateId}::uuid)
           or a.bowler_id in (${keepId}::uuid, ${duplicateId}::uuid)
           or a.wicket_player_id in (${keepId}::uuid, ${duplicateId}::uuid)
           or a.fielder_id in (${keepId}::uuid, ${duplicateId}::uuid)
      )
      select innings_id
      from roles
      where player_id in (${keepId}::uuid, ${duplicateId}::uuid)
      group by innings_id
      having count(distinct player_id) > 1
      limit 1
    `);
    if (clash.length > 0) return null;

    let ballEventCount = 0;
    for (const column of [
      'batsman_id',
      'non_striker_id',
      'bowler_id',
      'wicket_player_id',
      'fielder_id',
    ]) {
      const moved = await tx.execute<{ id: string }>(
        sql`update ball_events set ${sql.raw(column)} = ${keepId}::uuid
            where ${sql.raw(column)} = ${duplicateId}::uuid
            returning id`,
      );
      ballEventCount += moved.length;
    }

    /*
     * A squad the duplicate was in that the survivor is already in would
     * break the primary key, so those memberships are dropped rather than
     * moved. `onConflictDoNothing` cannot express it — this is an update, and
     * the row that would conflict has to go.
     */
    await tx.execute(sql`
      delete from team_members dupe
      where dupe.player_id = ${duplicateId}::uuid
        and exists (
          select 1 from team_members keep
          where keep.team_id = dupe.team_id and keep.player_id = ${keepId}::uuid
        )
    `);
    const squads = await tx.execute<{ team_id: string }>(sql`
      update team_members set player_id = ${keepId}::uuid
      where player_id = ${duplicateId}::uuid
      returning team_id
    `);

    let openings = 0;
    for (const column of ['opening_striker_id', 'opening_non_striker_id', 'opening_bowler_id']) {
      const moved = await tx.execute<{ id: string }>(
        sql`update innings set ${sql.raw(column)} = ${keepId}::uuid
            where ${sql.raw(column)} = ${duplicateId}::uuid
            returning id`,
      );
      openings += moved.length;
    }

    await tx.delete(players).where(eq(players.id, duplicateId));

    return { ballEvents: ballEventCount, squads: squads.length, inningsOpenings: openings };
  });
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

/**
 * The eleven a side actually put out, or nobody.
 *
 * An **empty array is a real answer** and callers must treat it as one: it
 * means no XI was recorded for this match, which is true of every match
 * created before migration 0018. `squadFor` in the match service is the one
 * place that decides what to do about it, and it falls back to the full
 * roster — the behaviour those matches were scored under.
 *
 * Ordered by batting order where one was given, then the way `getTeamMembers`
 * orders: captain, keeper, then alphabetically. A scorer reading this list is
 * looking for a name, and the two they look for most are at the top.
 */
export async function getMatchSquad(matchId: string, teamId: string): Promise<SquadMember[]> {
  return db
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
      isCaptain: matchSquads.isCaptain,
      isWicketkeeper: matchSquads.isWicketkeeper,
    })
    .from(matchSquads)
    .innerJoin(players, eq(matchSquads.playerId, players.id))
    .where(and(eq(matchSquads.matchId, matchId), eq(matchSquads.teamId, teamId)))
    .orderBy(
      // Nulls last, so an undecided order does not sort above a decided one.
      sql`${matchSquads.battingOrder} asc nulls last`,
      desc(matchSquads.isCaptain),
      desc(matchSquads.isWicketkeeper),
      asc(players.fullName),
    );
}

/**
 * Name a side's XI for a match.
 *
 * A whole-side replacement rather than an append: naming an XI is one
 * decision, and a partial update would make "I picked the wrong eleven" hard
 * to express. The caller has already checked that every id is on the club's
 * roster — see `assertSquadsInRosters`.
 *
 * `battingOrder` is the position in the array. It is a starting assumption
 * rather than a promise: the engine takes whoever the scorer names at the fall
 * of a wicket, and this is only what the picker offers first.
 */
export async function setMatchSquad(
  matchId: string,
  teamId: string,
  playerIds: string[],
  roles: Map<string, { isCaptain: boolean; isWicketkeeper: boolean }> = new Map(),
): Promise<void> {
  await db
    .delete(matchSquads)
    .where(and(eq(matchSquads.matchId, matchId), eq(matchSquads.teamId, teamId)));

  if (playerIds.length === 0) return;

  await db.insert(matchSquads).values(
    playerIds.map((playerId, i) => ({
      matchId,
      teamId,
      playerId,
      battingOrder: i + 1,
      isCaptain: roles.get(playerId)?.isCaptain ?? false,
      isWicketkeeper: roles.get(playerId)?.isWicketkeeper ?? false,
    })),
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

/**
 * Set the two facts that belong to a squad membership, and the jersey number.
 *
 * Captaincy and keeping are **exclusive within a squad**, so claiming either
 * releases whoever held it — in the same transaction, or a failure between the
 * two would leave a side with two captains or none.
 *
 * Undefined leaves a field alone. Setting a jersey number must not silently
 * strip a captaincy, and a partial update is the normal case here.
 */
export async function updateTeamMemberRole(
  teamId: string,
  playerId: string,
  patch: { isCaptain?: boolean; isWicketkeeper?: boolean; jerseyNumber?: number | null },
): Promise<void> {
  await db.transaction(async (tx) => {
    if (patch.isCaptain === true) {
      await tx
        .update(teamMembers)
        .set({ isCaptain: false })
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.isCaptain, true)));
    }
    if (patch.isWicketkeeper === true) {
      await tx
        .update(teamMembers)
        .set({ isWicketkeeper: false })
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.isWicketkeeper, true)));
    }

    await tx
      .update(teamMembers)
      .set(patch)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.playerId, playerId)));
  });
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

/**
 * Matches anyone can look at, live ones first.
 *
 * Every match is already publicly readable — the RLS policy says so, `/m/<id>`
 * is the thing people share, and `/api/matches/[id]/card` needs no session.
 * This discloses nothing new; it makes findable what was already public, which
 * is the same argument `searchPlayersByName` makes one table over.
 *
 * Without it a guest opened the app to a box asking them to paste a URL. If
 * they had a link they did not need the screen, and if they did not they had
 * nothing to do — which is a poor first minute for the one surface that exists
 * to be shared.
 *
 * Abandoned matches are left out. A no result is a real outcome and it belongs
 * on the club's own page, but it is not something to put in front of somebody
 * who has never seen the app.
 */
export async function listPublicMatches(limit: number): Promise<Match[]> {
  return db
    .select()
    .from(matches)
    .where(inArray(matches.status, ['live', 'completed']))
    .orderBy(
      // Live first, whatever the dates say — a match being played now is the
      // reason to open this screen.
      sql`case when ${matches.status} = 'live' then 0 else 1 end`,
      desc(sql`coalesce(${matches.startedAt}, ${matches.createdAt})`),
    )
    .limit(limit);
}

export async function getMatch(id: string): Promise<Match | null> {
  const rows = await db.select().from(matches).where(eq(matches.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Team names for a list of ids, in one query. */
export async function teamNamesFor(teamIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(teamIds)];
  if (unique.length === 0) return new Map();

  const rows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(inArray(teams.id, unique));

  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * Where each match has got to, for the whole list in one query.
 *
 * Read from the innings cache rather than replayed. Every figure here is also
 * derivable from `ball_events` and the scorecard does derive it — but that is
 * a replay per match, and this is a list. The cache columns exist for exactly
 * this: see the note on the `innings` table.
 */
export type MatchScoreLine = {
  inningsNumber: number;
  battingTeamId: string;
  runs: number;
  wickets: number;
  ballsBowled: number;
  target: number | null;
  status: string;
};

export async function inningsLinesFor(matchIds: string[]): Promise<Map<string, MatchScoreLine[]>> {
  const unique = [...new Set(matchIds)];
  if (unique.length === 0) return new Map();

  const rows = await db
    .select({
      matchId: inningsTable.matchId,
      inningsNumber: inningsTable.inningsNumber,
      battingTeamId: inningsTable.battingTeamId,
      runs: inningsTable.runs,
      wickets: inningsTable.wickets,
      ballsBowled: inningsTable.ballsBowled,
      target: inningsTable.target,
      status: inningsTable.status,
    })
    .from(inningsTable)
    .where(inArray(inningsTable.matchId, unique))
    .orderBy(asc(inningsTable.inningsNumber));

  const byMatch = new Map<string, MatchScoreLine[]>();
  for (const { matchId, ...line } of rows) {
    const existing = byMatch.get(matchId);
    if (existing) existing.push(line);
    else byMatch.set(matchId, [line]);
  }
  return byMatch;
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

/**
 * Change what a match says about itself. Scoped to the owner — a no-op
 * otherwise, like `updateTeam`.
 *
 * The teams and the toss are deliberately absent: every recorded ball names
 * players from the squads that were picked, and the innings rows already carry
 * the answer the toss produced.
 */
export async function updateMatchDetails(
  matchId: string,
  userId: string,
  patch: {
    title?: string;
    venue?: string;
    format?: string;
    oversPerInnings?: number;
    maxOversPerBowler?: number | null;
  },
): Promise<void> {
  await db
    .update(matches)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(matches.id, matchId), eq(matches.createdBy, userId)));
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

export type BallEventInsert = Omit<BallEvent, 'id' | 'createdAt' | 'createdBy' | 'requestId'> & {
  /** Optional: rows written before migration 0013 have none, and a client that does not send one still scores. */
  requestId?: string | null;
};

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
  /**
   * How many balls the innings held when `cache` was computed.
   *
   * `cache` describes the innings *as of a read that has already happened*,
   * and this write used to apply it unconditionally. `replaceBallSequence`
   * has guarded against exactly that since it was written; this path never
   * did, and it is the one that runs on every delivery.
   *
   * The losing sequence needs no unusual timing. Device A corrects ball 3
   * from a four to a dot and commits, so the innings drops from 87 to 83.
   * Device B, holding a read from before that, posts ball 6 — a genuinely new
   * ball, so the unique index is content — and writes `runs = 88`. The log
   * now says 84 and the cache says 88, and nothing recomputes it:
   * `recomputeInningsCaches` only runs when the overs or the bowler quota
   * change.
   *
   * That is not cosmetic drift. `matches.ts` reads this cache to set the
   * chase target for the second innings, and reads it again to decide who
   * won — so a stale write can hand the match to the wrong side and store a
   * result the scorecard will contradict for ever.
   *
   * Omit only for a caller that has genuinely just counted.
   */
  expectedBalls?: number,
): Promise<BallEvent | null> {
  const userId = await getUserId();
  if (!userId) {
    throw new Error('Unauthorized: ball events require a signed-in user');
  }

  return db.transaction(async (tx) => {
    if (expectedBalls !== undefined) {
      const [{ count } = { count: 0 }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(ballEvents)
        .where(eq(ballEvents.inningsId, inningsId));
      if (count !== expectedBalls) {
        throw new StaleInningsError(expectedBalls, count);
      }
    }

    const rows = await tx
      .insert(ballEvents)
      .values({ ...input, createdBy: userId })
      .returning();

    await tx.update(inningsTable).set(cache).where(eq(inningsTable.id, inningsId));

    return rows[0] ?? null;
  });
}

/**
 * The innings moved between the read that produced a cache and the write of
 * it. The caller should re-read and replay rather than retry blindly — the
 * delivery may be perfectly valid against the innings as it now stands.
 */
export class StaleInningsError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`Innings moved while scoring: expected ${expected} balls, found ${actual}`);
    this.name = 'StaleInningsError';
  }
}

/** The delivery already recorded under this client-generated request id, if any. */
export async function ballByRequestId(
  inningsId: string,
  requestId: string,
): Promise<BallEvent | null> {
  const rows = await db
    .select()
    .from(ballEvents)
    .where(and(eq(ballEvents.inningsId, inningsId), eq(ballEvents.requestId, requestId)))
    .limit(1);
  return rows[0] ?? null;
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
 * Rewrite a run of deliveries and move the innings with them, in one
 * transaction.
 *
 * The write half of a correction. `correctBall` has already replayed the
 * innings and produced every delivery from the edit onward as it now stands;
 * this puts them down together with the score they imply.
 *
 * **Why a transaction and not a loop of updates.** A correction touches the
 * edited delivery, every delivery after it, and the innings cache. A failure
 * part-way through leaves an innings whose ball log and score describe
 * different matches — and unlike a half-recorded ball, nothing later
 * recomputes it, because the next delivery appends rather than repairs.
 *
 * **Why `expectedTotal`.** Two scorers, or one scorer on two devices, can
 * correct and record at the same time. The rewritten deliveries were computed
 * against a ball log of a known length; if the log has grown or shrunk since,
 * that computation describes an innings that no longer exists and must not be
 * written. Checked inside the transaction, so there is no window.
 *
 * `ball_number` is deliberately never updated. It is the sequence position,
 * and a correction replaces a delivery rather than inserting one — which is
 * also why the unique index on (innings_id, ball_number) is not in the way.
 */
export async function replaceBallSequence(
  inningsId: string,
  balls: ReadonlyArray<{
    id: string;
    overNumber: number;
    eventType: BallEvent['eventType'];
    runsOffBat: number;
    /*
     * Declared, and written below.
     *
     * This was neither. The route has always passed `overthrowRuns` and the
     * type never mentioned it — excess properties survive `.map()` inference,
     * so it compiled — and the UPDATE never set it. Correcting a delivery into
     * one that carries overthrows therefore wrote `runs_off_bat` and
     * `total_runs` while leaving `overthrow_runs` at its old value, and
     * migration 0017's `total_runs = runs_off_bat + overthrow_runs +
     * extra_runs` refused the row. The correction failed and there was no way
     * to make it succeed.
     */
    overthrowRuns: number;
    battersCrossed?: boolean | null;
    /** When this correction happened. See migration 0021. */
    correctedAt?: Date | null;
    shotAngle?: number | null;
    shotDistance?: number | null;
    extraRuns: number;
    totalRuns: number;
    isLegalDelivery: boolean;
    isFreeHit: boolean;
    batsmanId: string;
    nonStrikerId: string;
    bowlerId: string;
    wicketType: BallEvent['wicketType'] | null;
    wicketPlayerId: string | null;
    fielderId: string | null;
    bowlerReplacedMidOver: boolean;
    commentary: string | null;
  }>,
  cache: {
    runs: number;
    wickets: number;
    ballsBowled: number;
    extras: number;
    status: 'not_started' | 'in_progress' | 'completed';
  },
  opts: { expectedTotal: number; reopenMatchId?: string } = { expectedTotal: -1 },
): Promise<boolean> {
  const userId = await getUserId();
  if (!userId) {
    throw new Error('Unauthorized: correcting a delivery requires a signed-in user');
  }

  return db.transaction(async (tx) => {
    if (opts.expectedTotal >= 0) {
      const current = await tx
        .select({ id: ballEvents.id })
        .from(ballEvents)
        .where(eq(ballEvents.inningsId, inningsId));
      if (current.length !== opts.expectedTotal) return false;
    }

    for (const ball of balls) {
      const updated = await tx
        .update(ballEvents)
        .set({
          overNumber: ball.overNumber,
          eventType: ball.eventType,
          runsOffBat: ball.runsOffBat,
          overthrowRuns: ball.overthrowRuns,
          extraRuns: ball.extraRuns,
          totalRuns: ball.totalRuns,
          isLegalDelivery: ball.isLegalDelivery,
          isFreeHit: ball.isFreeHit,
          batsmanId: ball.batsmanId,
          nonStrikerId: ball.nonStrikerId,
          bowlerId: ball.bowlerId,
          wicketType: ball.wicketType,
          wicketPlayerId: ball.wicketPlayerId,
          fielderId: ball.fielderId,
          bowlerReplacedMidOver: ball.bowlerReplacedMidOver,
          commentary: ball.commentary,
          battersCrossed: ball.battersCrossed ?? null,
          /*
           * Stamped on every delivery this rewrite touches.
           *
           * A correction replays the innings and writes back the ball that
           * changed *and* every one after it, because their ends and figures
           * may have moved with it. All of them were decided afterwards rather
           * than watched, and the card is entitled to say so.
           *
           * The caller's timestamp, not a fresh one: `correctBall` already put
           * it on the state it returns, and two `new Date()` calls would have
           * the response and the row disagree by a few milliseconds about when
           * the same act happened.
           */
          correctedAt: ball.correctedAt ?? new Date(),
          // Carried rather than recomputed — a replay does not know where the
          // ball went, so an UPDATE that omitted these would leave the
          // placement of a rewritten delivery describing the shot it used to
          // be. See migration 0019.
          shotAngle: ball.shotAngle ?? null,
          shotDistance: ball.shotDistance ?? null,
        })
        .where(and(eq(ballEvents.id, ball.id), eq(ballEvents.inningsId, inningsId)))
        .returning({ id: ballEvents.id });

      // A delivery we were rewriting is gone. Whatever raced us won; roll the
      // whole correction back rather than leaving a partial one.
      if (updated.length === 0) return false;
    }

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
