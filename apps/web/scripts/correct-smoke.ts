/**
 * Correcting a delivery that is already in the log — over HTTP.
 *
 * `lib/services/ball-correction.test.ts` asserts the replay logic and has done
 * for a while. What was never exercised end to end is a **wicket** correction,
 * because until now no client could send one: the correction sheet omitted
 * wickets on the grounds that half a dismissal recorded from a run-picker
 * would be worse than the mistake being fixed.
 *
 * That reasoning was right and the conclusion was wrong. It left the most
 * consequential mis-tap on the console — wrong dismissal, wrong fielder, wrong
 * batter out — with no fix short of undoing every ball since. The sheet now
 * hands over to the wicket sheet, and `patchBallSchema` has accepted the fields
 * all along. These prove the round trip.
 *
 * Three directions, because they fail differently:
 *
 *   changing a wicket — the ordinary case, and the one that has to keep the
 *   replay of everything after it intact;
 *
 *   removing a wicket — the batter who came in never comes in, which is
 *   drastic and correct, and is precisely what "that was not a wicket" means;
 *
 *   adding one — the delivery that was recorded as four runs was in fact a
 *   dismissal, which invalidates every ball after it.
 *
 * Run against a disposable database. It creates a club and abandons the match.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
}

type Json = Record<string, unknown>;

async function call<T = Json>(
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}

type Inn = {
  id: string;
  strikerId: string;
  nonStrikerId: string;
  currentBowlerId: string;
  runs: number;
  wickets: number;
};
type Ball = {
  id: string;
  eventType: string;
  wicketType?: string;
  totalRuns: number;
  overthrowRuns?: number;
};
type State = { currentInnings: Inn; balls: Ball[] };

async function main(): Promise<void> {
  console.log('correcting a delivery');

  const auth = await call<{ token: string }>('/api/auth/signup', {
    method: 'POST',
    body: {
      email: `correct-smoke-${Date.now()}@local`,
      password: 'correctsmoke123',
      displayName: 'Correction smoke',
    },
  });
  if (!auth.body.token) {
    console.error('Could not create a smoke account.', JSON.stringify(auth.body));
    process.exit(1);
  }
  const token = auth.body.token;
  const stamp = Date.now();

  // Two sides of six, so a couple of wickets does not end the innings.
  const sides: string[][] = [];
  const teamIds: string[] = [];
  for (const side of ['Bat', 'Bowl']) {
    const team = await call<{ team: { id: string } }>('/api/teams', {
      method: 'POST',
      token,
      body: { name: `Correct ${side} ${stamp}` },
    });
    teamIds.push(team.body.team.id);
    const ids: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const p = await call<{ player: { id: string } }>('/api/players', {
        method: 'POST',
        token,
        body: { fullName: `${side} ${i + 1} ${stamp}` },
      });
      ids.push(p.body.player.id);
      await call(`/api/teams/${team.body.team.id}/members`, {
        method: 'POST',
        token,
        body: { playerId: p.body.player.id },
      });
    }
    sides.push(ids);
  }

  const [bat, bowl] = sides as [string[], string[]];
  const created = await call<{ match: { id: string } }>('/api/matches', {
    method: 'POST',
    token,
    body: {
      title: `Correction smoke ${stamp}`,
      oversPerInnings: 10,
      teamAId: teamIds[0],
      teamBId: teamIds[1],
      teamAPlayerIds: bat,
      teamBPlayerIds: bowl,
      tossWinnerTeamId: teamIds[0],
      tossDecision: 'bat',
      openingStrikerId: bat[0],
      openingNonStrikerId: bat[1],
      openingBowlerId: bowl[0],
    },
  });
  const matchId = created.body.match.id;

  let inn: Inn | null = null;
  const post = async (body: Json) => {
    const r = await call<{ state: State }>(`/api/matches/${matchId}/ball`, {
      method: 'POST',
      token,
      body,
    });
    if (r.body.state) inn = r.body.state.currentInnings;
    return r;
  };

  const scorer = await call<{ state: State }>(`/api/matches/${matchId}/scorer`, { token });
  inn = scorer.body.state.currentInnings;

  const runBall = (runs: number): Json => ({
    inningsId: inn!.id,
    eventType: runs === 0 ? 'dot' : String(runs),
    runsOffBat: runs,
    extraRuns: 0,
    totalRuns: runs,
    batsmanId: inn!.strikerId,
    nonStrikerId: inn!.nonStrikerId,
    bowlerId: inn!.currentBowlerId,
  });

  // Two dots, a caught, then the replacement faces a four.
  await post(runBall(0));
  await post(runBall(0));

  const outBatter = inn!.strikerId;
  const wicketBall = await post({
    inningsId: inn!.id,
    eventType: 'wicket',
    runsOffBat: 0,
    extraRuns: 0,
    totalRuns: 0,
    batsmanId: inn!.strikerId,
    nonStrikerId: inn!.nonStrikerId,
    bowlerId: inn!.currentBowlerId,
    wicketType: 'caught',
    wicketPlayerId: outBatter,
    fielderId: bowl[2],
  });
  check('a caught dismissal is recorded', wicketBall.status === 200, wicketBall.body);

  const replacement = bat.find((p) => p !== outBatter && p !== inn!.nonStrikerId)!;
  await post({ ...runBall(4), batsmanId: replacement, nonStrikerId: inn!.nonStrikerId });

  const ballsNow = (await call<{ state: State }>(`/api/matches/${matchId}/scorer`, { token })).body
    .state.balls;
  const wicketId = ballsNow.find((b) => b.wicketType === 'caught')!.id;
  const fourId = ballsNow.find((b) => b.eventType === '4')!.id;

  const patch = (ballId: string, body: Json) =>
    call<{ state: State; changes: unknown[] }>(`/api/matches/${matchId}/ball/${ballId}`, {
      method: 'PATCH',
      token,
      body,
    });

  // ── 1. Change the dismissal ────────────────────────────────────────────────
  // The commonest correction there is: it was bowled, not caught, and nobody
  // should be credited with the catch.
  const changed = await patch(wicketId, {
    eventType: 'wicket',
    runsOffBat: 0,
    overthrowRuns: 0,
    extraRuns: 0,
    bowlerId: bowl[0],
    wicketType: 'bowled',
    wicketPlayerId: outBatter,
  });
  check('a caught can be corrected to a bowled', changed.status === 200, changed.body);
  check(
    'the dismissal now reads bowled',
    changed.body.state?.balls.some((b) => b.wicketType === 'bowled'),
  );
  check(
    'and the side has still lost exactly one wicket',
    changed.body.state?.currentInnings.wickets === 1,
    changed.body.state?.currentInnings.wickets,
  );

  // ── 2. Add a wicket where there was none ──────────────────────────────────
  // The four was in fact a run out. This is the direction that was completely
  // unreachable before — the correction sheet had no way to express it.
  const added = await patch(fourId, {
    eventType: 'wicket',
    runsOffBat: 0,
    overthrowRuns: 0,
    extraRuns: 0,
    bowlerId: bowl[0],
    wicketType: 'run_out',
    wicketPlayerId: replacement,
    fielderId: bowl[3],
  });
  check('a scoring shot can be corrected into a dismissal', added.status === 200, added.body);
  check(
    'the side has now lost two wickets',
    added.body.state?.currentInnings.wickets === 2,
    added.body.state?.currentInnings.wickets,
  );
  check(
    'and the four is off the board',
    added.body.state?.currentInnings.runs === 0,
    added.body.state?.currentInnings.runs,
  );

  // ── 3. Take a wicket away ─────────────────────────────────────────────────
  // An absent wicketType means the delivery no longer carries one. It is the
  // reason the patch is a replacement rather than a partial update.
  const removed = await patch(wicketId, {
    eventType: '1',
    runsOffBat: 1,
    overthrowRuns: 0,
    extraRuns: 0,
    bowlerId: bowl[0],
  });
  check('a wicket can be corrected away entirely', removed.status === 200, removed.body);
  check(
    'the dismissal is gone from the log',
    !removed.body.state?.balls.some((b) => b.wicketType === 'bowled'),
  );

  // ── 4. Correcting a delivery into one that carries overthrows ────────
  //
  // `replaceBallSequence` listed the columns it updates and `overthrow_runs`
  // was not among them, while the route had always passed it — excess
  // properties survive `.map()` inference, so nothing complained. The UPDATE
  // wrote `runs_off_bat` and `total_runs` and left `overthrow_runs` alone, and
  // migration 0017's `total_runs = runs_off_bat + overthrow_runs + extra_runs`
  // refused the row. This correction was simply impossible.
  const withOverthrow = await patch(fourId, {
    eventType: '1',
    runsOffBat: 1,
    overthrowRuns: 4,
    extraRuns: 0,
    bowlerId: bowl[0],
  });
  check(
    'a delivery can be corrected into one carrying overthrows',
    withOverthrow.status === 200,
    withOverthrow.body,
  );
  /*
   * Asserted on the delivery, not on the innings total.
   *
   * Three corrections have already moved that total, so a number checked
   * against it would be testing this script's bookkeeping rather than the
   * server's. The delivery is what the bug was about: `overthrow_runs` was
   * never written, so `total_runs` and its parts disagreed and migration
   * 0017's CHECK refused the row.
   */
  const corrected = withOverthrow.body.state?.balls.find((b) => b.id === fourId);
  check('the delivery reads 5 — 1 struck, 4 thrown away', corrected?.totalRuns === 5, corrected);

  // ── 5. A correction reports what it moved ─────────────────────────────────
  check(
    'the server says what the correction changed',
    Array.isArray(removed.body.changes),
    removed.body.changes,
  );

  await call(`/api/matches/${matchId}/abandon`, {
    method: 'POST',
    token,
    body: { reason: 'smoke test' },
  });
  await call(`/api/matches/${matchId}`, { method: 'DELETE', token });

  console.log(
    failed === 0
      ? `\n🏏 correct-smoke: all ${passed} checks passed`
      : `\n✗ correct-smoke: ${failed} of ${passed + failed} checks failed`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

void main();
