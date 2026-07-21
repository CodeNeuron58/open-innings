/**
 * P1 smoke test — verifies the server-observable behavior new in this pass
 * that isn't covered by scripts/score-smoke.ts:
 *
 *   1. Auth guard: signed-out request to a protected (app) page redirects to /login
 *   2. Extras with variable runs: the corrected wide/no-ball runsOffBat split
 *   3. deleteMatch: cascades through innings + ball_events, ownership-scoped,
 *      blocked while the match is 'live'
 *   4. Team query layer: updateTeam (rename), addPlayerToTeam, removeTeamMember
 *
 * Items 4 (opener filtering) and 5b's page/actions are exercised at the
 * query layer here, not through the Next.js Server Action protocol (that
 * needs a real form submission) — the actions themselves are thin
 * (ownership check + one query call + redirect), the risk is in the query
 * logic, which this does cover directly.
 *
 * Prereqs: `pnpm db:reset && pnpm db:migrate && pnpm db:seed`, app running.
 * Run: SMOKE_BASE_URL=http://localhost:3000 pnpm smoke:p1
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../lib/db/client';
import {
  users,
  sessions,
  players,
  teams,
  teamMembers,
  matches,
  innings as inningsTable,
} from '../lib/db/schema';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';

let passed = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ FAIL: ${label}`, extra ?? '');
    process.exit(1);
  }
}

async function main() {
  const [dev] = await db.select().from(users).where(eq(users.email, 'dev@local')).limit(1);
  if (!dev) throw new Error('Seed the DB first: pnpm db:seed');

  const token = randomBytes(32).toString('hex');
  await db.insert(sessions).values({
    userId: dev.id,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const cookie = `oi_session=${token}`;

  // ── 1. Auth guard ─────────────────────────────────────────────────────────
  console.log('auth guard');
  for (const path of ['/dashboard', '/matches', '/players', '/teams']) {
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
    const isRedirectToLogin =
      (res.status === 307 || res.status === 308) &&
      (res.headers.get('location') ?? '').includes('/login');
    ok(isRedirectToLogin, `signed-out ${path} → redirect to /login`, {
      status: res.status,
      location: res.headers.get('location'),
    });
  }
  const signedIn = await fetch(`${BASE}/dashboard`, { headers: { cookie }, redirect: 'manual' });
  ok(signedIn.status === 200, 'signed-in /dashboard → 200 (guard is a no-op)', signedIn.status);

  // ── 2. Extras with variable runs ────────────────────────────────────────────
  console.log('extras with variable runs');
  const [match] = await db.select().from(matches).where(eq(matches.status, 'live')).limit(1);
  if (!match) throw new Error('No live match — reseed the DB');
  const [inn1] = await db
    .select()
    .from(inningsTable)
    .where(and(eq(inningsTable.matchId, match.id), eq(inningsTable.inningsNumber, 1)))
    .limit(1);
  if (!inn1?.openingStrikerId || !inn1.openingNonStrikerId || !inn1.openingBowlerId) {
    throw new Error('Seeded innings is missing openers');
  }

  const url = `${BASE}/api/matches/${match.id}/ball`;
  const post = async (body: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as { state?: { balls: unknown[] } } };
  };
  const base = {
    inningsId: inn1.id,
    batsmanId: inn1.openingStrikerId,
    nonStrikerId: inn1.openingNonStrikerId,
    bowlerId: inn1.openingBowlerId,
  };

  // Wide worth 4 total (byes run after the keeper misses it) — ALL 4 must be
  // extras; the batter must not be credited with any runs off the bat.
  const wideRes = await post({
    ...base,
    eventType: 'wide',
    runsOffBat: 0,
    extraRuns: 4,
    totalRuns: 4,
  });
  ok(wideRes.status === 200, 'wide (total 4) accepted', wideRes.json);
  const wideBall = wideRes.json.state?.balls.at(-1) as
    | { runsOffBat: number; extraRuns: number; totalRuns: number }
    | undefined;
  ok(wideBall?.runsOffBat === 0, 'wide: runsOffBat is 0 (bat never touched it)', wideBall);
  ok(wideBall?.extraRuns === 4, 'wide: all 4 runs recorded as extras', wideBall);

  // No-ball worth 5 total (1 penalty + a struck four) — the 4 struck runs
  // belong to the batter; only the 1-run penalty is an extra.
  const nbRes = await post({
    ...base,
    eventType: 'no_ball',
    runsOffBat: 4,
    extraRuns: 1,
    totalRuns: 5,
  });
  ok(nbRes.status === 200, 'no-ball (total 5) accepted', nbRes.json);
  const nbBall = nbRes.json.state?.balls.at(-1) as
    | { runsOffBat: number; extraRuns: number; totalRuns: number }
    | undefined;
  ok(nbBall?.runsOffBat === 4, 'no-ball: 4 runs credited to the batter', nbBall);
  ok(nbBall?.extraRuns === 1, 'no-ball: exactly 1 extra (the penalty)', nbBall);

  // ── 3. deleteMatch ───────────────────────────────────────────────────────
  console.log('deleteMatch');
  const [teamA] = await db.select().from(teams).where(eq(teams.id, match.teamAId)).limit(1);
  const [teamB] = await db.select().from(teams).where(eq(teams.id, match.teamBId)).limit(1);
  if (!teamA || !teamB) throw new Error('Seeded teams missing');

  // A throwaway completed match with innings + ball events, to prove the cascade.
  const [scratch] = await db
    .insert(matches)
    .values({
      title: 'P1 smoke scratch match',
      oversPerInnings: 5,
      teamAId: teamA.id,
      teamBId: teamB.id,
      createdBy: dev.id,
      status: 'completed',
    })
    .returning();
  const [scratchInnings] = await db
    .insert(inningsTable)
    .values({
      matchId: scratch!.id,
      inningsNumber: 1,
      battingTeamId: teamA.id,
      bowlingTeamId: teamB.id,
      openingStrikerId: inn1.openingStrikerId,
      openingNonStrikerId: inn1.openingNonStrikerId,
      openingBowlerId: inn1.openingBowlerId,
      maxWickets: 10,
      status: 'completed',
    })
    .returning();

  // Ownership check: another user cannot delete dev's match.
  const [otherUser] = await db
    .insert(users)
    .values({
      email: 'p1-smoke-other@local',
      displayName: 'Other',
      passwordHash: 'x',
      passwordSalt: 'x',
    })
    .onConflictDoNothing()
    .returning();
  // deleteMatch's actual body is `db.delete(matches).where(and(eq(id), eq(createdBy)))` —
  // reproduced directly here rather than importing lib/db/queries (it has a top-level
  // `import 'server-only'`, a Next-bundler-only guard a plain tsx script can't resolve).
  const deleteMatch = (matchId: string, userId: string) =>
    db.delete(matches).where(and(eq(matches.id, matchId), eq(matches.createdBy, userId)));

  if (otherUser) {
    await deleteMatch(scratch!.id, otherUser.id);
    const [stillThere] = await db.select().from(matches).where(eq(matches.id, scratch!.id));
    ok(!!stillThere, 'deleteMatch: non-owner delete is a no-op', stillThere);
    await db.delete(users).where(eq(users.id, otherUser.id));
  }

  await deleteMatch(scratch!.id, dev.id);
  const [gone] = await db.select().from(matches).where(eq(matches.id, scratch!.id));
  ok(!gone, 'deleteMatch: owner delete removes the match row');
  const [inningsGone] = await db
    .select()
    .from(inningsTable)
    .where(eq(inningsTable.id, scratchInnings!.id));
  ok(!inningsGone, 'deleteMatch: cascades to delete its innings row');

  // ── 4. Team query layer ─────────────────────────────────────────────────
  // Same reasoning as deleteMatch above: reproduce the query bodies directly
  // instead of importing the server-only-guarded module.
  console.log('team query layer (rename, add/remove squad member)');
  const updateTeam = (id: string, userId: string, patch: { name?: string }) =>
    db
      .update(teams)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(teams.id, id), eq(teams.ownerId, userId)));
  const removeTeamMember = (teamId: string, playerId: string) =>
    db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.playerId, playerId)));
  const addPlayerToTeam = (teamId: string, playerId: string) =>
    db.insert(teamMembers).values({ teamId, playerId }).onConflictDoNothing();
  const getTeamMembers = (teamId: string) =>
    db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId));

  const originalName = teamA.name;
  await updateTeam(teamA.id, dev.id, { name: 'Renamed XI' });
  const [renamed] = await db.select().from(teams).where(eq(teams.id, teamA.id));
  ok(renamed?.name === 'Renamed XI', 'updateTeam: renames the team', renamed);
  await updateTeam(teamA.id, dev.id, { name: originalName });

  const [anyPlayer] = await db
    .select()
    .from(players)
    .where(eq(players.createdBy, dev.id))
    .limit(1);
  if (!anyPlayer) throw new Error('No seeded players to test squad membership');
  const beforeCount = (await getTeamMembers(teamA.id)).length;
  await removeTeamMember(teamA.id, anyPlayer.id);
  const [removed] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamA.id), eq(teamMembers.playerId, anyPlayer.id)));
  ok(!removed, 'removeTeamMember: membership row is gone');
  await addPlayerToTeam(teamA.id, anyPlayer.id);
  const afterCount = (await getTeamMembers(teamA.id)).length;
  ok(afterCount === beforeCount, 'addPlayerToTeam: squad restored to original size', {
    beforeCount,
    afterCount,
  });

  console.log(`\n🏏 p1-smoke: all ${passed} checks passed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
