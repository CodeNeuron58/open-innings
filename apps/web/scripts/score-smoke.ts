/**
 * End-to-end scoring smoke test — drives the ball API over HTTP the same way
 * the scorer UI does, through a full match lifecycle:
 *
 *   1. auth: unauthenticated POST is rejected (401)
 *   2. over 1 is scored ball by ball
 *   3. the same bowler starting over 2 is rejected (Law 16.2, 400)
 *   4. a new bowler is accepted
 *   5. a bowled striker is replaced by a new batter on the next ball
 *   6. a run-out non-striker is replaced in the non-striker slot
 *   7. innings 1 is bowled out to completion
 *   8. innings 2 (the chase) is created and won
 *   9. the match auto-completes with a result summary
 *  10. undoing the winning ball reopens the match
 *
 * Prereqs: `pnpm db:reset && pnpm db:migrate && pnpm db:seed`, app running.
 * Run: SMOKE_BASE_URL=http://localhost:3000 pnpm smoke:score
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../lib/db/client';
import {
  users,
  sessions,
  players,
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

type BallBody = {
  inningsId: string;
  eventType: string;
  runsOffBat: number;
  extraRuns: number;
  totalRuns: number;
  batsmanId: string;
  nonStrikerId: string;
  bowlerId: string;
  wicketType?: string;
  wicketPlayerId?: string;
  fielderId?: string;
};

async function main() {
  // ── Setup: session cookie for the dev user ────────────────────────────────
  const [dev] = await db.select().from(users).where(eq(users.email, 'dev@local')).limit(1);
  if (!dev) throw new Error('Seed the DB first: pnpm db:seed');

  const token = randomBytes(32).toString('hex');
  await db.insert(sessions).values({
    userId: dev.id,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const cookie = `oi_session=${token}`;

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

  const squad = async (teamId: string) =>
    db
      .select({ id: players.id, name: players.fullName })
      .from(teamMembers)
      .innerJoin(players, eq(teamMembers.playerId, players.id))
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(asc(players.fullName));

  const battingSquad = await squad(inn1.battingTeamId);
  const bowlingSquad = await squad(inn1.bowlingTeamId);

  const url = `${BASE}/api/matches/${match.id}/ball`;
  const post = async (body: BallBody, withAuth = true) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(withAuth ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  };
  const undo = async () => {
    const res = await fetch(url, { method: 'DELETE', headers: { cookie } });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  };

  // Rolling view of the innings, maintained the way the scorer UI does.
  let striker = inn1.openingStrikerId;
  let nonStriker = inn1.openingNonStrikerId;
  let bowler = inn1.openingBowlerId;
  let inningsId = inn1.id;

  const runBall = (runs: number): BallBody => ({
    inningsId,
    eventType: runs === 0 ? 'dot' : String(runs),
    runsOffBat: runs,
    extraRuns: 0,
    totalRuns: runs,
    batsmanId: striker,
    nonStrikerId: nonStriker,
    bowlerId: bowler,
  });

  type InnState = {
    strikerId: string;
    nonStrikerId: string;
    currentBowlerId: string;
    lastBowlerId?: string;
    runs: number;
    wickets: number;
    ballsBowled: number;
    status: string;
    target?: number;
  };
  const syncFrom = (json: Record<string, unknown>) => {
    const inn = (json.state as { currentInnings: InnState }).currentInnings;
    striker = inn.strikerId;
    nonStriker = inn.nonStrikerId;
    bowler = inn.currentBowlerId;
    return inn;
  };
  const nextBowler = (inn: InnState) => {
    const candidate = bowlingSquad.find((p) => p.id !== inn.lastBowlerId);
    if (!candidate) throw new Error('No bowler candidate');
    bowler = candidate.id;
  };

  // ── 1. Auth ───────────────────────────────────────────────────────────────
  console.log('auth');
  const unauth = await post(runBall(0), false);
  ok(unauth.status === 401, 'unauthenticated POST → 401', unauth);

  // ── 2. Over 1 ─────────────────────────────────────────────────────────────
  console.log('over 1');
  let inn: InnState | undefined;
  for (const runs of [0, 1, 2, 0, 4, 0]) {
    const r = await post(runBall(runs));
    ok(r.status === 200, `ball (${runs} runs) accepted`, r.json);
    inn = syncFrom(r.json);
  }
  ok(inn!.ballsBowled === 6, 'over 1 complete (6 legal balls)', inn);

  // ── 3+4. Law 16.2 ─────────────────────────────────────────────────────────
  console.log('bowler change');
  const sameBowler = await post(runBall(0));
  ok(
    sameBowler.status === 400 && sameBowler.json.code === 'BOWLER_BOWLED_CONSECUTIVE_OVERS',
    'same bowler for over 2 → 400 Law 16.2',
    sameBowler,
  );
  nextBowler(inn!);
  const newBowlerBall = await post(runBall(0));
  ok(newBowlerBall.status === 200, 'new bowler accepted for over 2', newBowlerBall.json);
  inn = syncFrom(newBowlerBall.json);

  // ── 5. Striker bowled → replacement ──────────────────────────────────────
  console.log('wicket + replacement (striker)');
  const wicket = await post({
    ...runBall(0),
    eventType: 'wicket',
    wicketType: 'bowled',
    wicketPlayerId: striker,
  });
  ok(wicket.status === 200, 'wicket recorded', wicket.json);
  const dismissed = striker;
  inn = syncFrom(wicket.json);
  const rep1 = battingSquad.find((p) => p.id !== striker && p.id !== nonStriker);
  if (!rep1) throw new Error('No replacement batter in squad');
  // The scorer sends the replacement on the next ball (single → ends swap)
  striker = rep1.id;
  const repBall = await post(runBall(1));
  ok(repBall.status === 200, 'replacement batter accepted', repBall.json);
  inn = syncFrom(repBall.json);
  ok(
    inn.strikerId === nonStriker || inn.nonStrikerId === rep1.id,
    'single rotates replacement to non-striker end',
    inn,
  );
  ok(
    inn.strikerId !== dismissed && inn.nonStrikerId !== dismissed,
    'dismissed batter is no longer at the crease',
    inn,
  );
  ok(inn.strikerId !== inn.nonStrikerId, 'no duplicate batter at both ends', inn);

  // ── 6. Non-striker run out → replacement in that slot ────────────────────
  console.log('wicket + replacement (non-striker run out)');
  const runOut = await post({
    ...runBall(0),
    eventType: 'wicket',
    wicketType: 'run_out',
    wicketPlayerId: nonStriker,
    fielderId: bowlingSquad[0]!.id,
  });
  ok(runOut.status === 200, 'run-out recorded', runOut.json);
  const dismissed2 = nonStriker;
  inn = syncFrom(runOut.json);
  const used = new Set([striker, nonStriker, dismissed, dismissed2]);
  const rep2 = battingSquad.find((p) => !used.has(p.id));
  if (!rep2) throw new Error('No second replacement in squad');
  nonStriker = rep2.id;
  const repBall2 = await post(runBall(0));
  ok(repBall2.status === 200, 'non-striker replacement accepted', repBall2.json);
  inn = syncFrom(repBall2.json);
  ok(inn.nonStrikerId === rep2.id, 'replacement took the non-striker slot', inn);

  // ── 7. Bowl out the rest of innings 1 ────────────────────────────────────
  console.log('finish innings 1');
  for (let i = 0; i < 500 && inn.status !== 'completed'; i++) {
    if (
      inn.ballsBowled > 0 &&
      inn.ballsBowled % 6 === 0 &&
      inn.lastBowlerId === inn.currentBowlerId
    ) {
      nextBowler(inn);
    }
    const r = await post(runBall(0));
    ok(r.status === 200, `filler ball ${i + 1}`, r.json);
    inn = syncFrom(r.json);
  }
  ok(inn.status === 'completed', 'innings 1 completed', inn);
  const finalFirstInningsRuns = inn.runs;

  // ── 8. Second innings (as the innings-break form does) ───────────────────
  console.log('second innings');
  const chaseBatting = bowlingSquad;
  const chaseBowling = battingSquad;
  const [inn2] = await db
    .insert(inningsTable)
    .values({
      matchId: match.id,
      inningsNumber: 2,
      battingTeamId: inn1.bowlingTeamId,
      bowlingTeamId: inn1.battingTeamId,
      target: finalFirstInningsRuns + 1,
      openingStrikerId: chaseBatting[0]!.id,
      openingNonStrikerId: chaseBatting[1]!.id,
      openingBowlerId: chaseBowling[0]!.id,
      maxWickets: 10,
      status: 'in_progress',
      startedAt: new Date(),
    })
    .returning();
  inningsId = inn2!.id;
  striker = chaseBatting[0]!.id;
  nonStriker = chaseBatting[1]!.id;
  bowler = chaseBowling[0]!.id;
  const bowlingSquad2 = chaseBowling;

  let chase: InnState | undefined;
  for (let i = 0; i < 500; i++) {
    if (
      chase &&
      chase.ballsBowled > 0 &&
      chase.ballsBowled % 6 === 0 &&
      chase.lastBowlerId === chase.currentBowlerId
    ) {
      const candidate = bowlingSquad2.find((p) => p.id !== chase!.lastBowlerId);
      bowler = candidate!.id;
    }
    const r = await post(runBall(4));
    ok(r.status === 200, `chase boundary ${i + 1}`, r.json);
    chase = syncFrom(r.json);
    if (chase.status === 'completed') break;
  }
  ok(chase!.status === 'completed', 'chase completed', chase);
  ok(chase!.runs >= finalFirstInningsRuns + 1, 'target reached', chase);

  // ── 9. Match auto-completed with a result ────────────────────────────────
  const [doneMatch] = await db.select().from(matches).where(eq(matches.id, match.id)).limit(1);
  ok(doneMatch!.status === 'completed', 'match status = completed', doneMatch!.status);
  ok(!!doneMatch!.summary?.includes('won by'), `result summary: "${doneMatch!.summary}"`);
  ok(doneMatch!.winningTeamId === inn1.bowlingTeamId, 'chasing side recorded as winner');

  // ── 10. Undo the winning ball reopens the match ──────────────────────────
  console.log('undo winning ball');
  const undone = await undo();
  ok(undone.status === 200, 'undo accepted', undone.json);
  const [reopened] = await db.select().from(matches).where(eq(matches.id, match.id)).limit(1);
  ok(reopened!.status === 'live', 'match reopened to live', reopened!.status);
  ok(reopened!.summary === null, 'result cleared on undo');

  // Re-win to leave the DB in a finished state
  const rewin = await post(runBall(4));
  ok(rewin.status === 200, 're-scored winning ball', rewin.json);
  const [finalMatch] = await db.select().from(matches).where(eq(matches.id, match.id)).limit(1);
  ok(finalMatch!.status === 'completed', 'match completed again');

  console.log(`\n🏏 score-smoke: all ${passed} checks passed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
