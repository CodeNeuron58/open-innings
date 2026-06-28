/**
 * Open Innings — typed DB query helpers.
 *
 * Server-only. These wrap Drizzle queries for the routes/server actions.
 * All return Promises. All handle auth via `getServerUser()`.
 */

import 'server-only';
import { asc, desc, eq, inArray } from 'drizzle-orm';
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
import { getSupabaseServerClient } from '@/lib/auth/server';

// ─────────────────────────────────────────────────────────────────────────────
// Auth helper
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the authenticated user ID, or null if not signed in. */
async function getUserId(): Promise<string | null> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

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
  return db
    .select()
    .from(teams)
    .where(eq(teams.ownerId, userId))
    .orderBy(asc(teams.name));
}

export async function getTeam(id: string): Promise<Team | null> {
  const rows = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getTeamMembers(teamId: string): Promise<Player[]> {
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
    })
    .from(teamMembers)
    .innerJoin(players, eq(teamMembers.playerId, players.id))
    .where(eq(teamMembers.teamId, teamId))
    .orderBy(asc(players.fullName));
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