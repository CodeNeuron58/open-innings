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
import { eq, inArray } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { users, players, teams, matches } from '../lib/db/schema';

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

    const foreignTeam = await call('GET', '/api/teams/00000000-0000-0000-0000-000000000000');
    ok(foreignTeam.status === 404, "someone else's team → 404, not 403", foreignTeam);

    // ── 5. Matches ──────────────────────────────────────────────────────────
    console.log('matches');
    const openers = {
      openingStrikerId: createdPlayerIds[0],
      openingNonStrikerId: createdPlayerIds[1],
      openingBowlerId: createdPlayerIds[2],
    };
    const validMatch = { oversPerInnings: 5, teamAId, teamBId, ...openers };

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

    const detailMatch = await call('GET', `/api/matches/${matchId}`);
    ok(detailMatch.status === 200, 'GET match → 200', detailMatch);
    ok(
      detailMatch.json.innings.length === 1,
      'match detail includes innings',
      detailMatch.json.innings?.length,
    );

    // ── 6. Innings endpoints ────────────────────────────────────────────────
    console.log('innings');
    const earlySecond = await call('POST', `/api/matches/${matchId}/innings`, openers);
    ok(earlySecond.status === 400, 'second innings before the first ends → 400', earlySecond);

    const ended = await call('POST', `/api/matches/${matchId}/innings/end`);
    ok(ended.status === 200, 'end innings → 200', ended);

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

    // ── 7. Delete ───────────────────────────────────────────────────────────
    console.log('delete');
    const liveDelete = await call('DELETE', `/api/matches/${matchId}`);
    ok(liveDelete.status === 400, 'deleting a live match → 400', liveDelete);

    await db.update(matches).set({ status: 'completed' }).where(eq(matches.id, matchId));
    const goneDelete = await call('DELETE', `/api/matches/${matchId}`);
    ok(goneDelete.status === 200, 'deleting a finished match → 200', goneDelete);

    const afterDelete = await call('GET', `/api/matches/${matchId}`);
    ok(afterDelete.status === 404, 'deleted match → 404', afterDelete);

    // ── 8. Rate limiting ────────────────────────────────────────────────────
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

    // ── 9. Logout ───────────────────────────────────────────────────────────
    console.log('logout');
    const loggedOut = await call('POST', '/api/auth/logout');
    ok(loggedOut.status === 200, 'logout → 200', loggedOut);

    const afterLogout = await call('GET', '/api/auth/session');
    ok(afterLogout.json.user === null, 'token is dead after logout', afterLogout.json);

    console.log(`\n🏏 api-smoke: all ${passed} checks passed`);
  } finally {
    // Clean up whatever got as far as existing, newest first.
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (user) {
      await db.delete(matches).where(eq(matches.createdBy, user.id));
      await db.delete(teams).where(eq(teams.ownerId, user.id));
      if (createdPlayerIds.length > 0) {
        await db.delete(players).where(inArray(players.id, createdPlayerIds));
      }
      await db.delete(users).where(eq(users.id, user.id));
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('✗ api-smoke failed:', err);
  process.exit(1);
});
