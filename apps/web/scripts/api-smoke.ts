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
import { eq, like } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { users, players, teams, matches, sessions } from '../lib/db/schema';

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

    // ── 5b. Scorer payload ──────────────────────────────────────────────────
    // The native scorer loads from one endpoint, so a missing field here is a
    // blank screen at a ground rather than a caught error.
    console.log('scorer');
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

    // ── 10. Delete ──────────────────────────────────────────────────────────
    console.log('delete');
    const liveDelete = await call('DELETE', `/api/matches/${matchId}`);
    ok(liveDelete.status === 400, 'deleting a live match → 400', liveDelete);

    await db.update(matches).set({ status: 'completed' }).where(eq(matches.id, matchId));
    const goneDelete = await call('DELETE', `/api/matches/${matchId}`);
    ok(goneDelete.status === 200, 'deleting a finished match → 200', goneDelete);

    const afterDelete = await call('GET', `/api/matches/${matchId}`);
    ok(afterDelete.status === 404, 'deleted match → 404', afterDelete);

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
