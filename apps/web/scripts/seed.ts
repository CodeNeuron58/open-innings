/**
 * Open Innings — dev seed.
 *
 * Populates a fresh database with:
 *   - 1 user (dev@local / devpassword123)
 *   - 8 players split across 2 teams
 *   - 1 in-progress match with the openers set, ready to score
 *
 * Run with: pnpm db:seed
 *
 * Idempotent: re-running won't duplicate rows. Safe to run after every
 * `pnpm db:reset`.
 */
import { db } from '../lib/db/client';
import { users, players, teams, teamMembers, matches, innings } from '../lib/db/schema';
import { hashPassword, newSalt } from '../lib/auth/password';
import { eq } from 'drizzle-orm';

const DEV_USER = {
  email: 'dev@local',
  password: 'devpassword123',
  displayName: 'Dev User',
};

type PlayerSeed = {
  fullName: string;
  shortName: string;
  role: 'batsman' | 'bowler' | 'all_rounder' | 'wicket_keeper' | 'wicket_keeper_batsman';
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
};

const TEAM_A_PLAYERS: PlayerSeed[] = [
  { fullName: 'Virat Kohli', shortName: 'VK', role: 'batsman', battingStyle: 'right_hand' },
  { fullName: 'Rohit Sharma', shortName: 'RS', role: 'batsman', battingStyle: 'right_hand' },
  { fullName: 'Jasprit Bumrah', shortName: 'JB', role: 'bowler', bowlingStyle: 'right_arm_fast' },
  { fullName: 'Ravindra Jadeja', shortName: 'RJ', role: 'all_rounder', battingStyle: 'left_hand', bowlingStyle: 'left_arm_spin' },
];

const TEAM_B_PLAYERS: PlayerSeed[] = [
  { fullName: 'Steve Smith', shortName: 'SS', role: 'batsman', battingStyle: 'right_hand' },
  { fullName: 'David Warner', shortName: 'DW', role: 'batsman', battingStyle: 'left_hand' },
  { fullName: 'Pat Cummins', shortName: 'PC', role: 'bowler', bowlingStyle: 'right_arm_fast' },
  { fullName: 'Mitchell Starc', shortName: 'MS', role: 'bowler', bowlingStyle: 'left_arm_fast' },
];

async function getOrCreateDevUser(): Promise<string> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, DEV_USER.email)).limit(1);
  if (existing[0]) return existing[0].id;

  const salt = newSalt();
  const passwordHash = await hashPassword(DEV_USER.password, salt);
  const inserted = await db
    .insert(users)
    .values({
      email: DEV_USER.email,
      displayName: DEV_USER.displayName,
      passwordHash,
      passwordSalt: salt,
    })
    .returning({ id: users.id });
  return inserted[0]!.id;
}

async function getOrCreateTeam(name: string, shortName: string, ownerId: string): Promise<string> {
  const existing = await db.select({ id: teams.id }).from(teams).where(eq(teams.name, name)).limit(1);
  if (existing[0]) return existing[0].id;
  const inserted = await db
    .insert(teams)
    .values({ name, shortName, ownerId })
    .returning({ id: teams.id });
  return inserted[0]!.id;
}

async function getOrCreatePlayer(seed: PlayerSeed, ownerId: string): Promise<string> {
  const existing = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.fullName, seed.fullName))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const { fullName, ...rest } = seed;
  const inserted = await db
    .insert(players)
    .values({ fullName, createdBy: ownerId, ...rest })
    .returning({ id: players.id });
  return inserted[0]!.id;
}

async function addMember(teamId: string, playerId: string): Promise<void> {
  const existing = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId))
    .limit(50); // small set
  if (existing.some((r) => r.teamId === teamId)) {
    const already = await db
      .select({ playerId: teamMembers.playerId })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId));
    if (already.some((r) => r.playerId === playerId)) return;
  }
  await db.insert(teamMembers).values({ teamId, playerId });
}

async function getOrCreateSampleMatch(
  ownerId: string,
  teamAId: string,
  teamBId: string,
  strikerId: string,
  nonStrikerId: string,
  bowlerId: string,
): Promise<string> {
  const existing = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.title, 'Sample Match (seed)'))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const matchInserted = await db
    .insert(matches)
    .values({
      title: 'Sample Match (seed)',
      venue: 'Local Park',
      oversPerInnings: 5,
      teamAId,
      teamBId,
      tossWinnerTeamId: teamAId,
      tossDecision: 'bat',
      status: 'live',
      createdBy: ownerId,
    })
    .returning({ id: matches.id });
  const matchId = matchInserted[0]!.id;

  await db.insert(innings).values({
    matchId,
    inningsNumber: 1,
    battingTeamId: teamAId,
    bowlingTeamId: teamBId,
    status: 'in_progress',
    startedAt: new Date(),
    openingStrikerId: strikerId,
    openingNonStrikerId: nonStrikerId,
    openingBowlerId: bowlerId,
    maxWickets: 10,
  });

  return matchId;
}

async function main() {
  console.log('→ Seeding Open Innings dev data...');
  const ownerId = await getOrCreateDevUser();
  console.log(`✓ Dev user: ${DEV_USER.email} (password: ${DEV_USER.password})`);

  const teamAId = await getOrCreateTeam('India', 'IND', ownerId);
  const teamBId = await getOrCreateTeam('Australia', 'AUS', ownerId);
  console.log(`✓ Teams: India, Australia`);

  // Players
  const playerIdsByName: Record<string, string> = {};
  for (const p of TEAM_A_PLAYERS) {
    playerIdsByName[p.fullName] = await getOrCreatePlayer(p, ownerId);
  }
  for (const p of TEAM_B_PLAYERS) {
    playerIdsByName[p.fullName] = await getOrCreatePlayer(p, ownerId);
  }
  console.log(`✓ 8 players`);

  // Team rosters
  for (const p of TEAM_A_PLAYERS) {
    await addMember(teamAId, playerIdsByName[p.fullName]!);
  }
  for (const p of TEAM_B_PLAYERS) {
    await addMember(teamBId, playerIdsByName[p.fullName]!);
  }
  console.log(`✓ Rosters assigned`);

  // Sample match — India batting, VK + RS opening, JB bowling
  const matchId = await getOrCreateSampleMatch(
    ownerId,
    teamAId,
    teamBId,
    playerIdsByName['Virat Kohli']!,
    playerIdsByName['Rohit Sharma']!,
    playerIdsByName['Jasprit Bumrah']!,
  );
  console.log(`✓ Sample match: /matches/${matchId}/score`);
  console.log('\n🎉 Seed complete. Sign in at /login with:');
  console.log(`    email:    ${DEV_USER.email}`);
  console.log(`    password: ${DEV_USER.password}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('✗ Seed failed:', err);
    process.exit(1);
  });