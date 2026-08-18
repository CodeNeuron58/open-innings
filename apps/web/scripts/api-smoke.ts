/**
 * REST API smoke test — exercises the JSON surface the mobile app will use.
 *
 * The critical difference from the other two scripts: after signing up, every
 * request here authenticates with `Authorization: Bearer`, never a cookie.
 * That is exactly how React Native will talk to this server, and nothing else
 * in the suite covers it.
 *
 * Covers: signup/login/session/logout, players, teams, squad membership,
 * match creation, the second-innings and end-innings endpoints, schema
 * rejections, ownership scoping, and the rate limiter.
 *
 * Self-cleaning: creates its own user under a unique email and removes
 * everything it made, so it can run repeatedly against the same database.
 *
 * Prereqs: app running, DB seeded.
 * Run: SMOKE_BASE_URL=http://localhost:3000 pnpm smoke:api
 */
import { createHash } from 'node:crypto';
import { and, eq, like } from 'drizzle-orm';
import { db } from '../lib/db/client';
import {
  users,
  players,
  teams,
  matches,
  innings as inningsTable,
  sessions,
  notifySignups,
} from '../lib/db/schema';

/** Mirrors the hashing in lib/auth/session.ts — the DB never stores raw tokens. */
const sha256 = (input: string) => createHash('sha256').update(input).digest('hex');

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';

class AssertionFailed extends Error {}

let passed = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
    return;
  }
  console.error(`  ✗ FAIL: ${label}`, extra ?? '');
  // Throw rather than `process.exit(1)`. This script creates a user, players
  // and teams, and cleans them up in a `finally` — but `process.exit` tears
  // the process down without unwinding, so an exit here would leak that data
  // on exactly the runs where something already went wrong.
  throw new AssertionFailed(label);
}

// Responses are probed field by field with optional chaining. Modelling each
// endpoint's body properly would restate the route handlers here and catch
// nothing the assertions below don't already check — the point of this script
// is to verify what the server actually sends, not what we believe it sends.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

async function main() {
  // A fresh identity each run keeps this independent of seeded state and of
  // any earlier run that died before cleanup.
  const email = `api-smoke-${Date.now()}@local`;
  const password = 'smoke-password-123';
  let token = '';
  const createdPlayerIds: string[] = [];

  const call = async (
    method: string,
    path: string,
    body?: unknown,
    auth = true,
  ): Promise<{ status: number; json: Json }> => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        // Bearer only — never a cookie. This is the mobile path.
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let json: Json = {};
    try {
      json = (await res.json()) as Json;
    } catch {
      /* empty body is fine */
    }
    return { status: res.status, json };
  };

  try {
    // ── 1. Signup ───────────────────────────────────────────────────────────
    console.log('signup');
    const badSignup = await call('POST', '/api/auth/signup', { email, password: 'short' }, false);
    ok(badSignup.status === 400, 'short password → 400', badSignup);
    ok(
      typeof badSignup.json.error === 'string',
      'validation failure uses the { error } contract',
      badSignup.json,
    );

    const signup = await call('POST', '/api/auth/signup', { email, password }, false);
    ok(signup.status === 201, 'signup → 201', signup);
    ok(
      typeof signup.json.token === 'string' && signup.json.token.length > 20,
      'signup returns a token',
    );
    ok(signup.json.user?.email === email, 'signup returns the user', signup.json.user);
    token = signup.json.token;

    const dupe = await call('POST', '/api/auth/signup', { email, password }, false);
    ok(dupe.status === 409, 'duplicate email → 409', dupe);

    // ── 2. Bearer auth ──────────────────────────────────────────────────────
    console.log('bearer auth');
    const session = await call('GET', '/api/auth/session');
    ok(session.status === 200, 'GET session → 200', session);
    ok(session.json.user?.email === email, 'bearer token identifies the user', session.json);

    const anon = await call('GET', '/api/auth/session', undefined, false);
    ok(anon.json.user === null, 'no credential → { user: null }', anon.json);

    const badToken = await fetch(`${BASE}/api/auth/session`, {
      headers: { Authorization: 'Bearer not-a-real-token' },
    });
    ok(((await badToken.json()) as Json).user === null, 'garbage token → { user: null }');

    const unauth = await call('POST', '/api/players', { fullName: 'X' }, false);
    ok(unauth.status === 401, 'unauthenticated create → 401', unauth);

    // ── 2b. Reads must not write ────────────────────────────────────────────
    // The sliding window used to extend expiresAt on every session lookup,
    // which made every authenticated read a write — and since the query layer
    // resolves the session once per query, a single screen issued several
    // UPDATEs against one row. A polling scorer would do that continuously.
    // session.ts now only writes when the expiry has genuinely drifted; this
    // asserts that, so the amplification can't quietly come back.
    const sessionRowBefore = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, sha256(token)))
      .limit(1);
    const expiryBefore = sessionRowBefore[0]?.expiresAt.getTime();
    ok(expiryBefore !== undefined, 'session row is findable by token hash');

    for (let i = 0; i < 5; i++) await call('GET', '/api/auth/session');

    const sessionRowAfter = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, sha256(token)))
      .limit(1);
    ok(
      sessionRowAfter[0]?.expiresAt.getTime() === expiryBefore,
      '5 authenticated reads performed 0 session writes',
      { before: expiryBefore, after: sessionRowAfter[0]?.expiresAt.getTime() },
    );

    // ── 2c. Expired sessions get swept ──────────────────────────────────────
    // Expired rows used to be removed only when someone happened to present
    // one, so sessions from devices a user never returns to accumulated
    // forever. createSession now fires an opportunistic purge.
    const [expired] = await db
      .insert(sessions)
      .values({
        userId: signup.json.user.id as string,
        tokenHash: sha256(`expired-${Date.now()}`),
        expiresAt: new Date(Date.now() - 60_000),
      })
      .returning();

    // Trigger createSession → purge with a second signup rather than a login.
    // Section 8 deliberately exhausts the login limiter, and that bucket
    // outlives the run by 15 minutes — driving this through /login would make
    // the test pass or fail depending on how recently it last ran.
    const secondEmail = `api-smoke-${Date.now()}-b@local`;
    const purgeTrigger = await call(
      'POST',
      '/api/auth/signup',
      { email: secondEmail, password },
      false,
    );
    ok(purgeTrigger.status === 201, 'second signup (purge trigger) → 201', purgeTrigger);

    // The purge is deliberately not awaited server-side — housekeeping must
    // not delay a sign-in — so poll rather than assert immediately.

    let swept = false;
    for (let i = 0; i < 15 && !swept; i++) {
      const rows = await db.select().from(sessions).where(eq(sessions.id, expired!.id)).limit(1);
      swept = rows.length === 0;
      if (!swept) await new Promise((r) => setTimeout(r, 200));
    }
    ok(swept, 'expired sessions are purged on sign-in');

    // ── 3. Players ──────────────────────────────────────────────────────────
    console.log('players');
    const names = ['Smoke Opener', 'Smoke Partner', 'Smoke Bowler', 'Smoke Fielder'];
    for (const fullName of names) {
      const res = await call('POST', '/api/players', { fullName, role: 'all_rounder' });
      ok(res.status === 201, `create player "${fullName}" → 201`, res);
      createdPlayerIds.push(res.json.player.id);
    }

    const badRole = await call('POST', '/api/players', { fullName: 'Nope', role: 'goalkeeper' });
    ok(badRole.status === 400, 'unknown enum value → 400', badRole);

    const playerList = await call('GET', '/api/players');
    ok(playerList.status === 200, 'GET players → 200', playerList);
    ok(
      playerList.json.players.length === 4,
      'list is scoped to this user',
      playerList.json.players?.length,
    );

    // ── 4. Teams and squads ─────────────────────────────────────────────────
    console.log('teams');
    const teamA = await call('POST', '/api/teams', {
      name: 'Smoke XI',
      playerIds: [createdPlayerIds[0], createdPlayerIds[1]],
    });
    ok(teamA.status === 201, 'create team with squad → 201', teamA);

    const teamB = await call('POST', '/api/teams', {
      name: 'Smoke Rovers',
      playerIds: [createdPlayerIds[2]],
    });
    ok(teamB.status === 201, 'create second team → 201', teamB);

    const teamAId = teamA.json.team.id as string;
    const teamBId = teamB.json.team.id as string;

    const detail = await call('GET', `/api/teams/${teamAId}`);
    ok(detail.status === 200, 'GET team detail → 200', detail);
    ok(detail.json.members.length === 2, 'squad seeded at creation', detail.json.members?.length);

    /*
     * Captaincy and keeping travel with the squad, not the player.
     *
     * They live on `team_members` and were dropped by the query for months,
     * so the XI picker and every squad list had no way to mark a captain. The
     * assertion is that the *fields arrive* — false is a real answer for a
     * squad nobody has assigned yet, and the shape is what regressed before.
     */
    const firstMember = detail.json.members?.[0];
    ok(
      typeof firstMember?.isCaptain === 'boolean' &&
        typeof firstMember?.isWicketkeeper === 'boolean',
      'squad members carry captain and keeper flags',
      firstMember,
    );

    /*
     * A player you did not create is not yours to put in a squad.
     *
     * Squad changes checked team ownership and nothing else, so any signed-in
     * account could add any player id to a team it owned — and then read that
     * player's name and role straight back out of /api/teams/[id]/club, which
     * is public and needs no session at all. A uuid being hard to guess is
     * not an access control, it is an obstacle.
     *
     * Done with a genuinely separate account rather than a fabricated id,
     * because the check being tested is "did *you* create this player", and a
     * made-up uuid would pass for the wrong reason — it does not exist. The
     * player here is real and belongs to somebody else, which is the case
     * that was actually open.
     *
     * The intruder is named api-smoke-* so the sweep in `finally` collects it.
     */
    const intruderEmail = `api-smoke-intruder-${Date.now()}@local`;
    const intruderSignup = await call(
      'POST',
      '/api/auth/signup',
      { email: intruderEmail, password },
      false,
    );
    ok(intruderSignup.status === 201, 'a second account signs up', intruderSignup.status);
    const intruderToken = intruderSignup.json.token as string;

    const asIntruder = async (method: string, path: string, body?: unknown) => {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${intruderToken}`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: res.status, json: (await res.json().catch(() => ({}))) as Json };
    };

    const intruderTeam = await asIntruder('POST', '/api/teams', { name: 'Intruder XI' });
    ok(intruderTeam.status === 201, 'the second account can create its own team', intruderTeam);
    const intruderTeamId = intruderTeam.json.team?.id as string;

    const steal = await asIntruder('POST', `/api/teams/${intruderTeamId}/members`, {
      playerId: createdPlayerIds[0],
    });
    ok(steal.status === 404, "another account's player cannot be added to a squad", steal.status);

    // And the same door at create time, which seeds a squad in one call.
    const stealAtCreate = await asIntruder('POST', '/api/teams', {
      name: 'Intruder XI B',
      playerIds: [createdPlayerIds[1]],
    });
    ok(
      stealAtCreate.status === 404,
      "another account's player cannot be seeded into a new team",
      stealAtCreate.status,
    );

    const renamed = await call('PATCH', `/api/teams/${teamAId}`, { name: 'Smoke XI Renamed' });
    ok(renamed.json.team.name === 'Smoke XI Renamed', 'PATCH renames the team', renamed.json.team);

    const added = await call('POST', `/api/teams/${teamBId}/members`, {
      playerId: createdPlayerIds[3],
    });
    ok(added.json.members.length === 2, 'add squad member', added.json.members?.length);

    const removed = await call('DELETE', `/api/teams/${teamBId}/members`, {
      playerId: createdPlayerIds[3],
    });
    ok(removed.json.members.length === 1, 'remove squad member', removed.json.members?.length);

    /*
     * Captaincy, keeping and the jersey number.
     *
     * All three columns have existed since the first migration and nothing had
     * ever written them, so every squad in the system had no captain and no
     * keeper. The keeper matters beyond decoration — they are who takes byes
     * and stumpings, and the obvious default fielder on a caught-behind.
     */
    const capped = await call('PATCH', `/api/teams/${teamAId}/members`, {
      playerId: createdPlayerIds[0],
      isCaptain: true,
      isWicketkeeper: true,
      jerseyNumber: 7,
    });
    ok(capped.status === 200, 'PATCH squad member → 200', capped);
    const skipper = (capped.json.members as Json[]).find((m) => m.id === createdPlayerIds[0]);
    ok(skipper?.isCaptain === true, 'captaincy is set', skipper);
    ok(skipper?.isWicketkeeper === true, 'keeping is set', skipper);

    // Both are exclusive within a squad: claiming either releases whoever had
    // it, or a side ends up with two captains and no way to tell which.
    const moved = await call('PATCH', `/api/teams/${teamAId}/members`, {
      playerId: createdPlayerIds[1],
      isCaptain: true,
    });
    const oldSkipper = (moved.json.members as Json[]).find((m) => m.id === createdPlayerIds[0]);
    const newSkipper = (moved.json.members as Json[]).find((m) => m.id === createdPlayerIds[1]);
    ok(newSkipper?.isCaptain === true, 'the new captain has it', newSkipper);
    ok(oldSkipper?.isCaptain === false, 'the old captain gives it up', oldSkipper);
    // …and only the captaincy moved. A partial update must not strip the rest.
    ok(
      oldSkipper?.isWicketkeeper === true,
      'keeping is untouched by a captaincy change',
      oldSkipper,
    );

    const notInSquad = await call('PATCH', `/api/teams/${teamAId}/members`, {
      playerId: createdPlayerIds[2],
      isCaptain: true,
    });
    ok(notInSquad.status === 404, 'cannot captain a squad you are not in', notInSquad);

    const foreignTeam = await call('GET', '/api/teams/00000000-0000-0000-0000-000000000000');
    ok(foreignTeam.status === 404, "someone else's team → 404, not 403", foreignTeam);

    // ── 5. Matches ──────────────────────────────────────────────────────────
    console.log('matches');
    const openers = {
      openingStrikerId: createdPlayerIds[0],
      openingNonStrikerId: createdPlayerIds[1],
      openingBowlerId: createdPlayerIds[2],
    };
    const validMatch = { oversPerInnings: 5, format: 't20', teamAId, teamBId, ...openers };

    // The bug this schema exists to prevent: a toss winner with no decision
    // used to fall through to "team A bats" and put the wrong side in.
    const halfToss = await call('POST', '/api/matches', {
      ...validMatch,
      tossWinnerTeamId: teamBId,
    });
    ok(halfToss.status === 400, 'toss winner without a decision → 400', halfToss);

    const sameTeam = await call('POST', '/api/matches', { ...validMatch, teamBId: teamAId });
    ok(sameTeam.status === 400, 'team playing itself → 400', sameTeam);

    const dupOpener = await call('POST', '/api/matches', {
      ...validMatch,
      openingNonStrikerId: createdPlayerIds[0],
    });
    ok(dupOpener.status === 400, 'same player at both ends → 400', dupOpener);

    // Squad membership is checked in the service, not the schema — it needs
    // a database round trip.
    const wrongSquad = await call('POST', '/api/matches', {
      ...validMatch,
      openingBowlerId: createdPlayerIds[3],
    });
    ok(wrongSquad.status === 400, 'bowler outside the bowling squad → 400', wrongSquad);

    const created = await call('POST', '/api/matches', validMatch);
    ok(created.status === 201, 'create match → 201', created);
    ok(
      created.json.match.status === 'live',
      'match goes live on creation',
      created.json.match?.status,
    );
    ok(created.json.inning.inningsNumber === 1, 'innings 1 opened', created.json.inning);
    const matchId = created.json.match.id as string;

    /*
     * The format label round-trips.
     *
     * It is a label, not a rule — the engine reads oversPerInnings and
     * nothing else — so the only thing that can go wrong is it silently not
     * being stored, which no other assertion would notice.
     */
    ok(
      created.json.match?.format === 't20',
      'the format label is stored and returned',
      created.json.match?.format,
    );

    const detailMatch = await call('GET', `/api/matches/${matchId}`);
    ok(detailMatch.status === 200, 'GET match → 200', detailMatch);
    ok(
      detailMatch.json.innings.length === 1,
      'match detail includes innings',
      detailMatch.json.innings?.length,
    );

    // ── 5b. Scorer payload ──────────────────────────────────────────────────
    // The native scorer loads from one endpoint, so a missing field here is a
    // blank screen at a ground rather than a caught error.
    console.log('scorer');
    /*
     * A match was permanent the moment it was created. The title and venue are
     * cosmetic; oversPerInnings is not — set it wrong at the toss and the
     * innings ends at the wrong point, with no way back but deleting the match.
     * Tested here, before any delivery, so the recompute it triggers has
     * nothing to reinterpret.
     */
    console.log('edit match');
    const renamedMatch = await call('PATCH', `/api/matches/${matchId}`, {
      title: 'Smoke Match Renamed',
      venue: 'A Different Ground',
    });
    ok(renamedMatch.status === 200, 'PATCH match → 200', renamedMatch);
    ok(
      renamedMatch.json.match?.title === 'Smoke Match Renamed',
      'title changed',
      renamedMatch.json,
    );

    const relength = await call('PATCH', `/api/matches/${matchId}`, { oversPerInnings: 8 });
    ok(relength.json.match?.oversPerInnings === 8, 'innings length changed', relength.json.match);

    const nothing = await call('PATCH', `/api/matches/${matchId}`, {});
    ok(nothing.status === 400, 'an empty patch → 400', nothing);

    const scorer = await call('GET', `/api/matches/${matchId}/scorer`);
    ok(scorer.status === 200, 'GET scorer → 200', scorer);

    const scorerState = scorer.json.state as {
      currentInnings?: { strikerId?: string; nonStrikerId?: string; currentBowlerId?: string };
      balls?: unknown[];
    };
    ok(scorerState?.currentInnings !== undefined, 'scorer returns replayed state', scorer.json);
    ok(
      scorerState.currentInnings?.strikerId === openers.openingStrikerId,
      'state seeded with the opening striker',
      scorerState.currentInnings,
    );
    ok(
      scorerState.currentInnings?.currentBowlerId === openers.openingBowlerId,
      'state seeded with the opening bowler',
      scorerState.currentInnings,
    );

    const batting = scorer.json.battingSquad as unknown[];
    const bowling = scorer.json.bowlingSquad as unknown[];
    const everyone = scorer.json.players as unknown[];

    ok(Array.isArray(batting) && batting.length > 0, 'scorer returns the batting squad', batting);
    ok(Array.isArray(bowling) && bowling.length > 0, 'scorer returns the bowling squad', bowling);

    // The wicket sheet offers any fielder, so `players` must be BOTH squads,
    // not just the fielding side. Asserting the sum rather than a fixed count
    // keeps this true whatever the fixture squads look like.
    ok(
      Array.isArray(everyone) && everyone.length === batting.length + bowling.length,
      'scorer returns players from both squads combined',
      { players: everyone?.length, batting: batting.length, bowling: bowling.length },
    );
    ok(
      typeof scorer.json.battingTeamName === 'string' &&
        typeof scorer.json.bowlingTeamName === 'string',
      'scorer returns both team names',
      scorer.json,
    );
    ok(
      scorer.json.awaitingSecondInnings === false,
      'not at the innings break mid-first-innings',
      scorer.json.awaitingSecondInnings,
    );

    const strangerScorer = await call('GET', `/api/matches/${matchId}/scorer`, undefined, false);
    ok(strangerScorer.status === 401, 'scorer without a token → 401', strangerScorer);

    // ── 6. Innings endpoints ────────────────────────────────────────────────
    console.log('innings');
    const earlySecond = await call('POST', `/api/matches/${matchId}/innings`, openers);
    ok(earlySecond.status === 400, 'second innings before the first ends → 400', earlySecond);

    const ended = await call('POST', `/api/matches/${matchId}/innings/end`);
    ok(ended.status === 200, 'end innings → 200', ended);

    // The "End the innings" button sits on the mandatory next-batter sheet,
    // so it is tapped by someone who has just been told their innings is over
    // — a nervous second tap is the norm. It must not surface "No innings is
    // in progress" on the innings-break screen that follows.
    const endedAgain = await call('POST', `/api/matches/${matchId}/innings/end`);
    ok(endedAgain.status === 200, 'repeat end-innings → 200, not an error', endedAgain);

    // With innings 1 closed and no chase yet, the scorer must render the
    // innings-break screen instead of a keypad with no batters on it.
    const atBreak = await call('GET', `/api/matches/${matchId}/scorer`);
    ok(
      atBreak.json.awaitingSecondInnings === true,
      'scorer reports the innings break once innings 1 ends',
      atBreak.json.awaitingSecondInnings,
    );
    ok(
      Array.isArray(atBreak.json.nextBattingSquad) && atBreak.json.nextBattingSquad.length > 0,
      'innings break offers the chasing side as next batters',
      atBreak.json.nextBattingSquad?.length,
    );

    // The chase needs two batters who are actually in the chasing squad, and
    // the remove-member test above took one of them back out of team B.
    //
    // This script had been opening the second innings with that player anyway,
    // and it worked: `startSecondInnings` never checked squad membership, so a
    // chase could be opened with somebody who was not in either side — who
    // would then appear on the scorecard and on their own public career page,
    // having never been at the ground. The check exists on both innings now,
    // so the fixture has to field a legal side.
    const restored = await call('POST', `/api/teams/${teamBId}/members`, {
      playerId: createdPlayerIds[3],
    });
    ok(restored.json.members.length === 2, 'chasing squad restored to two', restored.json.members);

    const wrongChaseOpener = await call('POST', `/api/matches/${matchId}/innings`, {
      openingStrikerId: createdPlayerIds[2],
      // In the *bowling* side, not the chasing one.
      openingNonStrikerId: createdPlayerIds[0],
      openingBowlerId: createdPlayerIds[0],
    });
    ok(
      wrongChaseOpener.status === 400,
      'chase opener outside the chasing squad → 400',
      wrongChaseOpener,
    );

    const second = await call('POST', `/api/matches/${matchId}/innings`, {
      openingStrikerId: createdPlayerIds[2],
      openingNonStrikerId: createdPlayerIds[3],
      openingBowlerId: createdPlayerIds[0],
    });
    ok(second.status === 201, 'start second innings → 201', second);
    ok(second.json.inning.target === 1, 'target = first-innings runs + 1', second.json.inning);

    // A nervous double-tap on the innings-break screen must not open a third.
    const again = await call('POST', `/api/matches/${matchId}/innings`, {
      openingStrikerId: createdPlayerIds[2],
      openingNonStrikerId: createdPlayerIds[3],
      openingBowlerId: createdPlayerIds[0],
    });
    ok(again.status === 200, 'repeat second-innings call → 200, not a duplicate', again);
    ok(
      again.json.inning.id === second.json.inning.id,
      'returns the existing innings',
      again.json.inning?.id,
    );

    // ── 7. Career stats ─────────────────────────────────────────────────────
    // Must run before the delete section: these figures are derived from
    // ball_events, and deleting the match cascades them away.
    console.log('career stats');

    // Nothing above this point posts a delivery — api-smoke exercises the
    // endpoints, and ball-by-ball scoring is score-smoke's job. So the two
    // balls the stats assertions need are scored here, deliberately, rather
    // than assuming data that does not exist.
    const inningsId = second.json.inning.id as string;
    const striker = createdPlayerIds[2];
    const nonStriker = createdPlayerIds[3];
    const bowler = createdPlayerIds[0];

    /*
     * Two dots, and it has to be dots.
     *
     * The first innings scored nothing, so the target is 1 — any run at all
     * wins the match on the spot, which both rejects the next delivery with
     * "Innings is already completed" and leaves the delete section below with
     * a finished match when it needs a live one.
     *
     * Boundary counting is covered by the engine's own tests; what these two
     * balls exist to prove is that the aggregation reads real ball_events at
     * all, and that a never-out batter's average comes back null.
     */
    for (const label of ['first', 'second']) {
      const res = await call('POST', `/api/matches/${matchId}/ball`, {
        inningsId,
        eventType: 'dot',
        runsOffBat: 0,
        extraRuns: 0,
        totalRuns: 0,
        batsmanId: striker,
        nonStrikerId: nonStriker,
        bowlerId: bowler,
      });
      ok(res.status === 200 || res.status === 201, `score the ${label} dot → ok`, res);
    }

    const batterId = striker;
    const career = await call('GET', `/api/players/${batterId}/stats`);
    ok(career.status === 200, 'GET player stats → 200', career);

    const bat = career.json.career?.batting;
    ok(bat?.innings === 1, 'career shows one innings', bat);
    ok(bat?.runs === 0, 'runs match the balls scored', bat?.runs);
    ok(bat?.balls === 2, 'balls faced counts both deliveries', bat?.balls);
    ok(
      bat?.strikeRate === 0,
      'a wicketless duck has a strike rate of 0, not null',
      bat?.strikeRate,
    );

    // A never-out batter has no average. Null rather than Infinity or 0 — the
    // single easiest figure in cricket to get wrong, and the reason average
    // and strike rate are not the same nullability: strike rate needs balls,
    // average needs dismissals.
    ok(bat?.notOuts === 1 && bat?.average === null, 'never out → average is null', {
      notOuts: bat?.notOuts,
      average: bat?.average,
    });

    // The bowler's analysis is the same balls seen from the other end.
    const bowlerCareer = await call('GET', `/api/players/${bowler}/stats`);
    const bowl = bowlerCareer.json.career?.bowling;
    ok(bowl?.balls === 2 && bowl?.runs === 0, 'bowling figures agree with the batting', bowl);
    ok(bowl?.wickets === 0 && bowl?.average === null, 'wicketless → average is null', bowl);
    ok(bowl?.economy === 0, 'two maiden-ish dots → economy 0, not null', bowl?.economy);

    /*
     * Matches, not innings.
     *
     * This batter faced two balls in one match and did not bowl, so both
     * counts happen to be 1 — but the bowler below bowled in that same match,
     * and if `matches` were ever built by adding batting innings to bowling
     * innings, a player who did both would show 2. It is the headline figure
     * on the career page, sitting next to the runs.
     */
    ok(
      career.json.career?.matches === 1,
      'career counts distinct matches',
      career.json.career?.matches,
    );
    ok(
      career.json.career?.player?.fullName !== undefined &&
        'role' in (career.json.career?.player ?? {}),
      'career carries the player identity fields the profile header needs',
      career.json.career?.player,
    );

    // ── 7b. Career briefs ───────────────────────────────────────────────────
    // The batch the pickers use. Must agree with the per-player endpoint —
    // two figures for the same player on two screens is the bug this exists
    // to avoid.
    console.log('career briefs');
    const briefs = await call(
      'GET',
      `/api/players/briefs?ids=${[batterId, bowler, createdPlayerIds[1]].join(',')}`,
    );
    ok(briefs.status === 200, 'GET player briefs → 200', briefs);
    ok(briefs.json.briefs?.length === 3, 'one brief per id asked for', briefs.json.briefs?.length);

    const batterBrief = briefs.json.briefs?.find((b: Json) => b.playerId === batterId) as
      Json | undefined;
    ok(
      batterBrief?.runs === bat?.runs && batterBrief?.battingBalls === bat?.balls,
      'briefs agree with the per-player career endpoint',
      { brief: batterBrief, career: bat },
    );
    ok(batterBrief?.matches === 1, 'briefs count distinct matches', batterBrief?.matches);

    /*
     * A player who has never faced a ball still gets a row.
     *
     * createdPlayerIds[1] was created and never batted or bowled. Returning
     * nothing for them would make the client unable to tell "no record" from
     * "not in the response", and the picker would show a spinner forever.
     */
    const unplayed = briefs.json.briefs?.find((b: Json) => b.playerId === createdPlayerIds[1]) as
      Json | undefined;
    ok(
      unplayed !== undefined && unplayed.matches === 0 && unplayed.runs === 0,
      'a player with no record still gets a zeroed brief',
      unplayed,
    );

    const noIds = await call('GET', '/api/players/briefs?ids=');
    ok(
      noIds.status === 200 && noIds.json.briefs?.length === 0,
      'no ids → empty list, not an error',
      noIds,
    );

    // Ids are interpolated into ::uuid casts, so a malformed one has to be
    // rejected here rather than becoming a 500 from the driver.
    const badIds = await call('GET', '/api/players/briefs?ids=not-a-uuid');
    ok(badIds.status === 400, 'a malformed id → 400, not a 500', badIds);

    const unauthBriefs = await call('GET', `/api/players/briefs?ids=${batterId}`, undefined, false);
    ok(unauthBriefs.status === 401, 'briefs require a session → 401', unauthBriefs);

    // The page is the shareable artifact — it has to open for someone with no
    // account, so the endpoint must not require a session.
    const publicCareer = await call('GET', `/api/players/${batterId}/stats`, undefined, false);
    ok(publicCareer.status === 200, 'player stats are public (no auth) → 200', publicCareer);

    const missing = await call(
      'GET',
      '/api/players/00000000-0000-0000-0000-000000000000/stats',
      undefined,
      false,
    );
    ok(missing.status === 404, 'unknown player → 404', missing);

    // ── 8. Match summary ────────────────────────────────────────────────────
    // Feeds the result screen and the match share card. Must also run before
    // the delete section, for the same reason career stats does.
    console.log('match summary');
    const summary = await call('GET', `/api/matches/${matchId}/summary`);
    ok(summary.status === 200, 'GET match summary → 200', summary);
    ok(
      Array.isArray(summary.json.innings) && summary.json.innings.length === 2,
      'summary folds both innings, not just the one in progress',
      summary.json.innings,
    );
    ok(
      typeof summary.json.innings?.[0]?.teamName === 'string' &&
        typeof summary.json.innings?.[0]?.overs === 'string',
      'each innings carries a team name and an overs figure',
      summary.json.innings?.[0],
    );

    /*
     * Nothing but two dot balls was ever scored, so every standout is empty.
     *
     * These are the assertions worth having: the easy mistake in all four is
     * returning a zero-valued winner — a "top scorer" on 0, or a player of the
     * match nobody can name — which would put a stranger's name on a share
     * card for a game in which they did nothing.
     */
    ok(
      summary.json.topScorer === null,
      'nobody scored → topScorer is null',
      summary.json.topScorer,
    );
    ok(
      summary.json.bestBowler === null,
      'no wickets fell → bestBowler is null',
      summary.json.bestBowler,
    );
    ok(
      summary.json.mostSixes === null,
      'no six was hit → mostSixes is null',
      summary.json.mostSixes,
    );
    ok(
      summary.json.playerOfTheMatch === null,
      'no contribution → no player of the match',
      summary.json.playerOfTheMatch,
    );

    // The result is the artifact people send to a group chat, so it has to
    // open for someone with no account — same rule as the career page.
    const publicSummary = await call('GET', `/api/matches/${matchId}/summary`, undefined, false);
    ok(publicSummary.status === 200, 'match summary is public (no auth) → 200', publicSummary);

    const missingSummary = await call(
      'GET',
      '/api/matches/00000000-0000-0000-0000-000000000000/summary',
      undefined,
      false,
    );
    ok(missingSummary.status === 404, 'summary for an unknown match → 404', missingSummary);

    // ── 7b2. Claiming a player ──────────────────────────────────────────────
    /*
     * An account saying which player on the field it is.
     *
     * The column existed from the first schema and nothing ever set it, so
     * "my career" had nowhere to point. What is worth asserting is the
     * refusals: claiming is how one account could otherwise inherit another
     * person's entire career.
     */
    console.log('claiming a player');
    const beforeClaim = await call('GET', '/api/auth/session');
    ok(beforeClaim.json.playerId === null, 'a fresh account claims nobody', beforeClaim.json);

    const claim = await call('PUT', '/api/me/player', { playerId: createdPlayerIds[0] });
    ok(claim.status === 200, 'claim a player you created → 200', claim);

    const afterClaim = await call('GET', '/api/auth/session');
    ok(
      afterClaim.json.playerId === createdPlayerIds[0],
      'the session reports the claimed player',
      afterClaim.json.playerId,
    );

    // Tapping twice is not an error.
    const reclaim = await call('PUT', '/api/me/player', { playerId: createdPlayerIds[0] });
    ok(reclaim.status === 200, 'claiming the same player again → 200', reclaim);

    // One player per account: the second claim releases the first, rather
    // than leaving an account pointing at two careers.
    await call('PUT', '/api/me/player', { playerId: createdPlayerIds[1] });
    const afterSecond = await call('GET', '/api/auth/session');
    ok(
      afterSecond.json.playerId === createdPlayerIds[1],
      'claiming a second player replaces the first',
      afterSecond.json.playerId,
    );

    const notMine = await call('PUT', '/api/me/player', {
      playerId: '00000000-0000-0000-0000-000000000000',
    });
    ok(notMine.status === 400, 'a player you did not create cannot be claimed', notMine);

    const released = await call('DELETE', '/api/me/player');
    ok(released.status === 200, 'release → 200', released);
    const afterRelease = await call('GET', '/api/auth/session');
    ok(afterRelease.json.playerId === null, 'released, and the session says so', afterRelease.json);

    // ── 7c. Watching ────────────────────────────────────────────────────────
    /*
     * Presence, not followers. The value of this number is that it is true,
     * so what is worth asserting is that it counts *distinct* readers: a
     * heartbeat every ten seconds must update a row, not add one, or a single
     * person reading for a minute would show as six.
     */
    console.log('watching');
    const beat = (key: string) =>
      call('POST', `/api/matches/${matchId}/watching`, { watcherKey: key }, false);

    const firstBeat = await beat('watcher-aaaaaaaa');
    ok(firstBeat.status === 200, 'POST watching → 200, no account needed', firstBeat);
    ok(firstBeat.json.watching === 1, 'one reader counts as one', firstBeat.json.watching);

    const repeatBeat = await beat('watcher-aaaaaaaa');
    ok(
      repeatBeat.json.watching === 1,
      'the same reader beating again is still one',
      repeatBeat.json.watching,
    );

    const secondBeat = await beat('watcher-bbbbbbbb');
    ok(secondBeat.json.watching === 2, 'a second reader counts as two', secondBeat.json.watching);

    const shortKey = await beat('nope');
    ok(shortKey.status === 400, 'a too-short watcher key → 400', shortKey);

    const listWithWatching = await call('GET', '/api/matches');
    ok(
      listWithWatching.json.matches?.some((m: Json) => m.id === matchId && m.watching === 2),
      'the match list carries the watching count',
      listWithWatching.json.matches?.find((m: Json) => m.id === matchId)?.watching,
    );

    // ── 8b. The club page ───────────────────────────────────────────────────
    console.log('club page');
    const club = await call('GET', `/api/teams/${teamAId}/club`);
    ok(club.status === 200, 'GET club page → 200', club);
    ok(club.json.team?.id === teamAId, 'club page returns the team', club.json.team);
    ok(
      Array.isArray(club.json.squad) && club.json.squad.length > 0,
      'club page returns the squad',
      club.json.squad?.length,
    );
    ok(
      Array.isArray(club.json.results) && club.json.results.length > 0,
      'club page lists the matches this club played',
      club.json.results?.length,
    );
    /*
     * playedAt has to be a string, not a Date.
     *
     * It goes through JSON either way, so the client would receive a string
     * regardless — but the route serialises it explicitly and the shared type
     * says `string | null`. The career endpoint had exactly this bug: a field
     * annotated as Date that arrived as a string, and `getFullYear` threw on
     * it in production code that typechecked cleanly.
     */
    const firstResult = club.json.results?.[0];
    ok(
      firstResult?.playedAt === null || typeof firstResult?.playedAt === 'string',
      'club results carry playedAt as an ISO string, not a Date',
      firstResult?.playedAt,
    );
    /*
     * All four leader slots, always present.
     *
     * Null is the right answer for a club nobody has scored 50 balls for —
     * but the *key* has to be there, or the client cannot tell "no leader"
     * from "this build does not send one".
     */
    for (const slot of ['runs', 'wickets', 'strikeRate', 'catches'] as const) {
      ok(slot in (club.json.leaders ?? {}), `club leaders carry ${slot}`, club.json.leaders);
    }

    const publicClub = await call('GET', `/api/teams/${teamAId}/club`, undefined, false);
    ok(publicClub.status === 200, 'club page is public (no auth) → 200', publicClub);

    const missingClub = await call(
      'GET',
      '/api/teams/00000000-0000-0000-0000-000000000000/club',
      undefined,
      false,
    );
    ok(missingClub.status === 404, 'club page for an unknown team → 404', missingClub);

    // ── 9. The full card ────────────────────────────────────────────────────
    // Feeds the scorecard and over-by-over tabs. Before delete, same reason.
    console.log('match card');
    const card = await call('GET', `/api/matches/${matchId}/card`);
    ok(card.status === 200, 'GET match card → 200', card);
    ok(
      Array.isArray(card.json.innings) && card.json.innings.length === 2,
      'card carries both innings',
      card.json.innings?.length,
    );

    const secondCard = card.json.innings?.[1];
    ok(
      Array.isArray(secondCard?.deliveries) && secondCard.deliveries.length === 2,
      'the chase carries both deliveries that were bowled',
      secondCard?.deliveries?.length,
    );

    /*
     * Names, not ids.
     *
     * The over-by-over feed renders these straight into a sentence — "Kamath
     * to Thomas, no run". A uuid leaking through would be visible to every
     * reader, and the aggregation only looked up players who batted or bowled
     * until fielders were added to it.
     */
    const firstDelivery = secondCard?.deliveries?.[0];
    ok(
      typeof firstDelivery?.batsmanName === 'string' &&
        !firstDelivery.batsmanName.includes('-') &&
        firstDelivery.batsmanName !== 'Unknown',
      'deliveries carry resolved player names, not ids',
      firstDelivery,
    );
    ok(
      typeof firstDelivery?.bowlerName === 'string' && firstDelivery.bowlerName !== 'Unknown',
      'deliveries carry the bowler by name',
      firstDelivery?.bowlerName,
    );

    ok(
      secondCard?.extras?.total === 0 && secondCard?.extras?.wides === 0,
      'two dot balls conceded no extras of any kind',
      secondCard?.extras,
    );
    ok(
      Array.isArray(secondCard?.batting) && secondCard.batting.length > 0,
      'the batting table is populated',
      secondCard?.batting?.length,
    );
    ok(
      secondCard?.fallOfWickets?.length === 0,
      'no wickets fell, so nothing is in the fall of wickets',
      secondCard?.fallOfWickets,
    );

    const publicCard = await call('GET', `/api/matches/${matchId}/card`, undefined, false);
    ok(publicCard.status === 200, 'match card is public (no auth) → 200', publicCard);

    const missingCard = await call(
      'GET',
      '/api/matches/00000000-0000-0000-0000-000000000000/card',
      undefined,
      false,
    );
    ok(missingCard.status === 404, 'card for an unknown match → 404', missingCard);

    // ── 9b. Export ──────────────────────────────────────────────────────────
    /*
     * "Full export of your scorebook, any time" is on the paywall's
     * free-forever list. A claim like that has to actually be true.
     *
     * Fetched raw rather than through `call`, which parses JSON — the point
     * of these two responses is that they are files.
     */
    console.log('export');
    const csvRes = await fetch(`${BASE}/api/matches/${matchId}/export?format=csv`);
    const csv = await csvRes.text();
    ok(csvRes.status === 200, 'GET export csv → 200', csvRes.status);
    ok(
      (csvRes.headers.get('content-type') ?? '').includes('text/csv'),
      'csv export is served as csv',
      csvRes.headers.get('content-type'),
    );
    ok(
      (csvRes.headers.get('content-disposition') ?? '').includes('attachment'),
      'csv export downloads rather than rendering',
      csvRes.headers.get('content-disposition'),
    );

    const csvLines = csv.trim().split('\r\n');
    ok(
      Boolean(csvLines[0]?.includes('innings') && csvLines[0]?.includes('bowler')),
      'csv starts with a header row',
      csvLines[0],
    );
    // Two dot balls were bowled in section 7, so header + 2.
    ok(csvLines.length === 3, 'one csv row per delivery', csvLines.length);
    ok(
      Boolean(csvLines[1]?.startsWith('"') && csvLines[1]?.includes('","')),
      'every csv field is quoted — names contain commas and apostrophes',
      csvLines[1],
    );

    const jsonRes = await fetch(`${BASE}/api/matches/${matchId}/export?format=json`);
    ok(jsonRes.status === 200, 'GET export json → 200', jsonRes.status);
    const exported = (await jsonRes.json()) as Json;
    ok(
      exported.innings?.length === 2 && exported.innings[1]?.deliveries?.length === 2,
      'json export carries both innings and every ball',
      exported.innings?.length,
    );

    const badFormat = await call('GET', `/api/matches/${matchId}/export?format=pdf`);
    ok(badFormat.status === 400, 'an unsupported format → 400', badFormat);

    // ── 9c. Super Over ──────────────────────────────────────────────────────
    //
    // A tie is reachable by ordinary scoring — bowl the chase out one short —
    // so setting one up here is arranging the *precondition*, not reaching
    // past the endpoint under test. What is under test is everything that
    // happens next, and none of it was reachable at all before: `initialState`
    // has always handled innings 3 and 4, and no route could create one.
    console.log('super over');

    await db
      .update(inningsTable)
      .set({ status: 'completed', runs: 0 })
      .where(and(eq(inningsTable.matchId, matchId), eq(inningsTable.inningsNumber, 2)));

    // Decided, not level: a super over is not something a scorer may choose.
    await db
      .update(matches)
      .set({ status: 'completed', result: 'team_b_win' })
      .where(eq(matches.id, matchId));

    const notTied = await call('POST', `/api/matches/${matchId}/innings`, {
      openingStrikerId: createdPlayerIds[2],
      openingNonStrikerId: createdPlayerIds[3],
      openingBowlerId: createdPlayerIds[0],
    });
    ok(notTied.status === 400, 'a Super Over on a decided match → 400', notTied);

    await db.update(matches).set({ result: 'tie' }).where(eq(matches.id, matchId));

    const tiedSummary = await call('GET', `/api/matches/${matchId}/summary`);
    ok(
      tiedSummary.json.canStartSuperOver === true,
      'a tied match offers a Super Over',
      tiedSummary.json,
    );

    const superOver = await call('POST', `/api/matches/${matchId}/innings`, {
      openingStrikerId: createdPlayerIds[2],
      openingNonStrikerId: createdPlayerIds[3],
      openingBowlerId: createdPlayerIds[0],
    });
    ok(superOver.status === 201, 'a tied match opens a Super Over → 201', superOver);
    ok(
      superOver.json.inning?.inningsNumber === 3,
      'the Super Over is innings 3',
      superOver.json.inning,
    );
    ok(
      superOver.json.inning?.target === null,
      'the side batting first has no target',
      superOver.json.inning,
    );
    // Two wickets, and never more than the side has players for.
    ok(
      superOver.json.inning?.maxWickets <= 2,
      'a Super Over is capped at two wickets',
      superOver.json.inning?.maxWickets,
    );
    /*
     * The side that batted second in the match bats first in the Super Over.
     * That is the playing condition, and it is the one transition where the
     * sides do NOT swap — getting it backwards would look right until somebody
     * checked whose name was on the scorecard.
     */
    const secondInningsRow = await db
      .select()
      .from(inningsTable)
      .where(and(eq(inningsTable.matchId, matchId), eq(inningsTable.inningsNumber, 2)))
      .limit(1);
    ok(
      superOver.json.inning?.battingTeamId === secondInningsRow[0]?.battingTeamId,
      'the side that batted second bats first in the Super Over',
      {
        superOver: superOver.json.inning?.battingTeamId,
        chase: secondInningsRow[0]?.battingTeamId,
      },
    );

    // A tie closed the match; the Super Over has to reopen it, or the ball
    // endpoint would refuse every delivery of the innings just created.
    const reopened = await call('GET', `/api/matches/${matchId}`);
    ok(
      reopened.json.match?.status === 'live',
      'the match reopens for the Super Over',
      reopened.json.match?.status,
    );

    const superAgain = await call('POST', `/api/matches/${matchId}/innings`, {
      openingStrikerId: createdPlayerIds[2],
      openingNonStrikerId: createdPlayerIds[3],
      openingBowlerId: createdPlayerIds[0],
    });
    ok(superAgain.status === 200, 'a second tap does not open a fourth innings', superAgain);
    ok(
      superAgain.json.inning?.id === superOver.json.inning?.id,
      'it returns the Super Over that exists',
      superAgain.json.inning?.id,
    );

    // The innings length is load-bearing, so it is fixed once a match is over.
    await db.update(matches).set({ status: 'completed' }).where(eq(matches.id, matchId));
    const lateRelength = await call('PATCH', `/api/matches/${matchId}`, { oversPerInnings: 3 });
    ok(lateRelength.status === 400, 'the length of a finished match is fixed', lateRelength);
    await db.update(matches).set({ status: 'live' }).where(eq(matches.id, matchId));

    // ── 10. Abandon, then delete ────────────────────────────────────────────
    //
    // These belong together, because until there was a way to abandon a match
    // there was no way to delete a live one either — and this script hid that
    // by reaching past the API and setting `status = 'completed'` in the
    // database. A fixture that writes the state the endpoint refuses to reach
    // proves the endpoint works on state a user can never produce.
    console.log('abandon + delete');
    const liveDelete = await call('DELETE', `/api/matches/${matchId}`);
    ok(liveDelete.status === 400, 'deleting a live match → 400', liveDelete);

    const abandoned = await call('POST', `/api/matches/${matchId}/abandon`, { reason: 'Rain' });
    ok(abandoned.status === 200, 'abandoning a live match → 200', abandoned);
    ok(abandoned.json.match?.status === 'abandoned', 'match status = abandoned', abandoned.json);
    ok(abandoned.json.match?.result === 'no_result', 'match result = no_result', abandoned.json);
    ok(
      typeof abandoned.json.match?.summary === 'string' &&
        abandoned.json.match.summary.includes('Rain'),
      'the reason reaches the scorecard',
      abandoned.json,
    );

    // Tapped twice by somebody packing up in the rain.
    const abandonedTwice = await call('POST', `/api/matches/${matchId}/abandon`);
    ok(abandonedTwice.status === 200, 'abandoning twice → 200', abandonedTwice);

    // No innings may be left in progress, or the scorer console would still
    // offer to take deliveries for a match that is over.
    const openInnings = await db
      .select({ id: inningsTable.id })
      .from(inningsTable)
      .where(and(eq(inningsTable.matchId, matchId), eq(inningsTable.status, 'in_progress')));
    ok(openInnings.length === 0, 'abandon closes every innings still in progress', openInnings);

    const goneDelete = await call('DELETE', `/api/matches/${matchId}`);
    ok(goneDelete.status === 200, 'deleting an abandoned match → 200', goneDelete);

    const afterDelete = await call('GET', `/api/matches/${matchId}`);
    ok(afterDelete.status === 404, 'deleted match → 404', afterDelete);

    // ── 10b. Notify list ────────────────────────────────────────────────────
    console.log('notify');
    const notifyEmail = `notify-smoke-${Date.now()}@local`;
    const notified = await call('POST', '/api/notify', { email: notifyEmail, source: 'smoke' });
    ok(notified.status === 200, 'POST notify → 200', notified);

    /*
     * A second submission is not an error.
     *
     * People tap twice. Returning a conflict would also make this endpoint a
     * way to ask "is this address already registered?", which is not a
     * question a landing-page form should answer to anyone who asks.
     */
    const again2 = await call('POST', '/api/notify', {
      email: notifyEmail.toUpperCase(),
      source: 'smoke',
    });
    ok(again2.status === 200, 'a repeat signup → 200, same as the first', again2);

    const storedSignups = await db
      .select()
      .from(notifySignups)
      .where(eq(notifySignups.email, notifyEmail));
    ok(
      storedSignups.length === 1,
      'the repeat did not create a second row — email is stored lower-cased',
      storedSignups.length,
    );

    const badEmail = await call('POST', '/api/notify', { email: 'not-an-email' });
    ok(badEmail.status === 400, 'a malformed address → 400', badEmail);

    await db.delete(notifySignups).where(eq(notifySignups.email, notifyEmail));

    // ── 10c. Missing pages are 404, not 200 ─────────────────────────────────
    /*
     * The whole growth model is shared links, so a dead one has to *say* it is
     * dead. A root `app/loading.tsx` used to wrap the site in Suspense, which
     * committed a 200 before `notFound()` could throw — the page looked right
     * in a browser and was wrong to every crawler. See app/not-found.tsx.
     */
    console.log('missing pages');
    const ghost = '00000000-0000-0000-0000-000000000000';
    for (const [label, path] of [
      ['career', `/p/${ghost}`],
      ['scorecard', `/m/${ghost}`],
    ] as const) {
      const res = await fetch(`${BASE}${path}`);
      ok(res.status === 404, `a missing ${label} page → 404, not 200`, res.status);
    }

    // ── 10d. Nothing writes without a credential ────────────────────────────
    /*
     * The boundary guest mode rests on.
     *
     * A guest can read every public surface and create nothing, and the app
     * draws that distinction — but the drawing is manners, not enforcement. A
     * client-side check can always be bypassed; what actually stops an
     * anonymous write is each of these refusing one.
     *
     * Enumerated rather than sampled, because the failure is silent: a new
     * mutating route that forgets `getUserId()` looks completely fine until
     * someone finds it.
     */
    console.log('anonymous writes are refused');
    const ghostId = '00000000-0000-0000-0000-000000000000';
    const mutations: [string, string, unknown?][] = [
      ['POST', '/api/players', { fullName: 'Nobody' }],
      ['POST', '/api/teams', { name: 'Nobody XI' }],
      ['POST', `/api/teams/${ghostId}/members`, { playerId: ghostId }],
      ['DELETE', `/api/teams/${ghostId}/members`, { playerId: ghostId }],
      ['PATCH', `/api/teams/${ghostId}`, { name: 'Renamed' }],
      [
        'POST',
        '/api/matches',
        // Two *different* ids: a team cannot play itself, and the schema says
        // so — which would surface as a 400 and mask what is being tested.
        { oversPerInnings: 20, teamAId: ghostId, teamBId: '11111111-1111-1111-1111-111111111111' },
      ],
      ['DELETE', `/api/matches/${ghostId}`],
      ['POST', `/api/matches/${ghostId}/innings`, {}],
      ['POST', `/api/matches/${ghostId}/innings/end`],
      ['POST', `/api/matches/${ghostId}/ball`, {}],
      ['DELETE', `/api/matches/${ghostId}/ball`],
      // Not a write, but it is the one *read* a guest must not have: bulk
      // career figures for arbitrary ids.
      ['GET', `/api/players/briefs?ids=${ghostId}`],
    ];

    for (const [method, path, body] of mutations) {
      const res = await call(method, path, body, false);
      ok(res.status === 401, `${method} ${path.split('?')[0]} without a token → 401`, res.status);
    }

    // ── 11. Rate limiting ────────────────────────────────────────────────────
    console.log('rate limit');
    // Must exceed the login cap in app/api/auth/login/route.ts (30 per 15 min).
    // If that cap is raised, raise this too or the assertion silently rots.
    let sawTooMany = false;
    for (let i = 0; i < 40; i++) {
      const res = await call(
        'POST',
        '/api/auth/login',
        { email, password: 'definitely-wrong' },
        false,
      );
      if (res.status === 429) {
        sawTooMany = true;
        break;
      }
    }
    ok(sawTooMany, 'repeated failed logins eventually → 429');

    // ── 12. Logout ───────────────────────────────────────────────────────────
    console.log('logout');
    const loggedOut = await call('POST', '/api/auth/logout');
    ok(loggedOut.status === 200, 'logout → 200', loggedOut);

    const afterLogout = await call('GET', '/api/auth/session');
    ok(afterLogout.json.user === null, 'token is dead after logout', afterLogout.json);

    console.log(`\n🏏 api-smoke: all ${passed} checks passed`);
  } finally {
    // Sweep every api-smoke identity, not just this run's. A run that died
    // before this block existed — or one killed outright — leaves rows
    // behind, and they'd accumulate in the dev database forever otherwise.
    // Deleting by owner rather than by tracked id also catches anything
    // created after the failure point.
    const stale = await db.select().from(users).where(like(users.email, 'api-smoke-%'));
    for (const user of stale) {
      await db.delete(matches).where(eq(matches.createdBy, user.id));
      await db.delete(teams).where(eq(teams.ownerId, user.id));
      await db.delete(players).where(eq(players.createdBy, user.id));
      await db.delete(sessions).where(eq(sessions.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  }

  process.exit(0);
}

main().catch((err) => {
  // An assertion failure already printed what broke; anything else is a
  // genuine crash and deserves the stack.
  if (err instanceof AssertionFailed) {
    console.error('\n✗ api-smoke failed');
  } else {
    console.error('✗ api-smoke crashed:', err);
  }
  process.exit(1);
});
