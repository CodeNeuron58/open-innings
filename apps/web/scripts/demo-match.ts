/**
 * Build the demo match the Play Store screenshots are taken of.
 *
 * Drives the public REST API over HTTP — the same surface the phone uses — so
 * it works against production without touching the database, and everything it
 * creates is exactly what the app would have created.
 *
 * The alternative is scoring thirty-eight overs by hand through the keypad,
 * twice, which is well over an hour of tapping for data nobody will ever look
 * at again. Screenshots are the listing, though, and a listing showing
 * `Kkc v Australia` with a batter called `Haudb` reads as an unfinished app.
 *
 *   OI_EMAIL=you@example.com OI_PASSWORD=... \
 *   SMOKE_BASE_URL=https://openinnings.com pnpm demo:match
 *
 * ## It signs in; it does not sign up
 *
 * An account created here would be stuck at the six-digit screen, because
 * `(app)/_layout.tsx` holds every unverified account there and this script
 * cannot read an inbox. So it logs into an account that already exists and
 * says so plainly if that fails.
 *
 * Use **your own** account. The screenshots have to be taken signed in as the
 * scorer: `AdBar` returns null for the person who scored the match, so an ad
 * only appears if somebody else is looking.
 *
 * ## Idempotent enough
 *
 * Re-running creates a **second** match with the same name. That is deliberate
 * — deleting the first would mean deciding which of two identical matches was
 * the one you wanted — so if you re-run it, delete the older one from the app.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const BASE = (process.env.SMOKE_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.OI_EMAIL;
const PASSWORD = process.env.OI_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error(
    '✗ Set OI_EMAIL and OI_PASSWORD to an account that already exists and is verified.',
  );
  console.error(
    '  OI_EMAIL=you@example.com OI_PASSWORD=... SMOKE_BASE_URL=https://openinnings.com pnpm demo:match',
  );
  process.exit(1);
}

// ─── The cast ────────────────────────────────────────────────────────────────
//
// Plausible club names and initials-plus-surname, which is how a scorer writes
// a name in a book. Deliberately not real cricketers: a well-known name in a
// Play listing is a likeness problem, and it reads as placeholder data to
// anybody who knows the game.

const HOME = 'Koramangala XI';
const AWAY = 'HSR Strikers';
const VENUE = 'Koramangala Ground';

const HOME_XI = [
  'A. Menon',
  'S. Kurien',
  'R. Thomas',
  'V. Nair',
  'D. Pillai',
  'K. Raghavan',
  'J. Mathew',
  'N. Varghese',
  'P. Sasi',
  'T. Joseph',
  'B. Anand',
];

const AWAY_XI = [
  'M. Kamath',
  'G. Shetty',
  'H. Rao',
  'S. Bhat',
  'A. Hegde',
  'R. Pai',
  'V. Kulkarni',
  'N. Desai',
  'Y. Naik',
  'C. Prabhu',
  'L. Gowda',
];

/** Roles, so the squad list and career pages are not blank. */
const ROLE_BY_INDEX = [
  'batsman',
  'batsman',
  'batsman',
  'wicket_keeper_batsman',
  'all_rounder',
  'all_rounder',
  'bowler',
  'bowler',
  'bowler',
  'bowler',
  'bowler',
] as const;

// Responses are read field by field with optional chaining, exactly as
// `api-smoke.ts` does and for the same reason: modelling each endpoint's body
// here would restate the route handlers and catch nothing this script cares
// about, which is what the server actually sends back.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

let token = '';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Deliveries per minute this script is allowed.
 *
 * `POST /ball` permits 120 a minute per user, which is generous for a human —
 * a scorer taps once every thirty seconds — and immediately too slow for a
 * script that can do two a second. Pacing under the ceiling is politer than
 * hammering it and recovering, and the whole match still takes about two
 * minutes.
 */
const BALL_INTERVAL_MS = 550;

async function call(method: string, path: string, body?: unknown, attempt = 0): Promise<Json> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json: Json = {};
  try {
    json = text ? (JSON.parse(text) as Json) : {};
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  /*
   * A 429 is recoverable, and the server says how long to wait. Retried twice
   * rather than once: the limiter is a fixed window, so a retry landing in the
   * same window as the refusal is refused again through no fault of its own.
   */
  if (res.status === 429 && attempt < 2) {
    const seconds = Number(/in (\d+)s/.exec(String(json.error ?? ''))?.[1] ?? 30);
    console.log(`  … rate limited, waiting ${seconds + 2}s`);
    await sleep((seconds + 2) * 1000);
    return call(method, path, body, attempt + 1);
  }

  if (res.status >= 400) {
    throw new Error(
      `${method} ${path} → ${res.status}: ${json.error ?? JSON.stringify(json).slice(0, 200)}`,
    );
  }
  return json;
}

/**
 * The shape of the innings, kept the way the scorer console keeps it.
 *
 * Every ball response carries the whole replayed state, so who is on strike is
 * read back rather than tracked — the engine rotates it, and guessing here is
 * how a script quietly puts the wrong batter on the wrong end.
 */
type Live = {
  strikerId: string;
  nonStrikerId: string;
  currentBowlerId: string;
  runs: number;
  wickets: number;
  ballsBowled: number;
  status: string;
  inningsId: string;
};

/** `17.4`, not `17.67`. Overs are sixths, and a decimal here reads as a bug. */
const overs = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;

function liveFrom(json: Json): Live {
  const inn = json.state?.currentInnings ?? {};
  return {
    strikerId: inn.strikerId,
    nonStrikerId: inn.nonStrikerId,
    currentBowlerId: inn.currentBowlerId,
    runs: inn.runs ?? 0,
    wickets: inn.wickets ?? 0,
    ballsBowled: inn.ballsBowled ?? 0,
    status: inn.status ?? 'in_progress',
    inningsId: inn.id,
  };
}

/**
 * A repeatable pattern of deliveries.
 *
 * Not random: the same seed has to produce the same screenshots, and a wagon
 * wheel built from `Math.random` occasionally comes out as eleven shots to
 * mid-on. This is a fixed cycle that yields a believable scoring rate with
 * boundaries where a real innings has them.
 */
const OVER_PATTERN = [1, 0, 4, 1, 2, 0, 1, 6, 0, 1, 2, 1, 0, 4, 1, 1, 0, 2, 1, 1, 3, 0, 1, 4];

/** Shot placement for the boundaries, so the wheel has real spread. */
const PLACEMENTS = [
  { angle: 32, distance: 96 },
  { angle: 300, distance: 92 },
  { angle: 88, distance: 88 },
  { angle: 145, distance: 78 },
  { angle: 12, distance: 99 },
  { angle: 262, distance: 84 },
  { angle: 55, distance: 71 },
  { angle: 318, distance: 66 },
  { angle: 104, distance: 93 },
  { angle: 208, distance: 58 },
  { angle: 70, distance: 80 },
  { angle: 340, distance: 74 },
];

async function main() {
  console.log(`→ ${BASE}`);

  // ── Sign in ───────────────────────────────────────────────────────────────
  try {
    const auth = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
    token = auth.token as string;
  } catch (err) {
    console.error('✗ Could not sign in.');
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    console.error('  Create the account in the app first and confirm the six-digit code,');
    console.error('  then run this again. This script cannot read your inbox.');
    process.exit(1);
  }
  console.log(`✓ Signed in as ${EMAIL}`);

  // ── Clubs and players ─────────────────────────────────────────────────────
  const home = (await call('POST', '/api/teams', { name: HOME, homeGround: VENUE })).team;
  const away = (await call('POST', '/api/teams', { name: AWAY })).team;
  console.log(`✓ Clubs: ${HOME}, ${AWAY}`);

  const makeSquad = async (names: string[], teamId: string) => {
    const ids: string[] = [];
    for (const [i, fullName] of names.entries()) {
      const p = (await call('POST', '/api/players', { fullName, role: ROLE_BY_INDEX[i] })).player;
      await call('POST', `/api/teams/${teamId}/members`, { playerId: p.id });
      ids.push(p.id as string);
    }
    return ids;
  };

  const homeIds = await makeSquad(HOME_XI, home.id);
  const awayIds = await makeSquad(AWAY_XI, away.id);
  console.log(`✓ ${HOME_XI.length + AWAY_XI.length} players, both squads filled`);

  // Captain and keeper, so the squad list is not eleven identical rows.
  await call('PATCH', `/api/teams/${home.id}/members`, { playerId: homeIds[0], isCaptain: true });
  await call('PATCH', `/api/teams/${home.id}/members`, {
    playerId: homeIds[3],
    isWicketkeeper: true,
  });
  await call('PATCH', `/api/teams/${away.id}/members`, { playerId: awayIds[0], isCaptain: true });
  await call('PATCH', `/api/teams/${away.id}/members`, {
    playerId: awayIds[3],
    isWicketkeeper: true,
  });

  // ── The match ─────────────────────────────────────────────────────────────
  //
  // Away wins the toss and bats, so the home side chases — a live chase is the
  // most compelling single frame this app has, and it is what the console
  // screenshot needs.
  const match = (
    await call('POST', '/api/matches', {
      title: `${HOME} v ${AWAY}`,
      venue: VENUE,
      oversPerInnings: 20,
      format: 't20',
      teamAId: home.id,
      teamBId: away.id,
      teamAPlayerIds: homeIds,
      teamBPlayerIds: awayIds,
      tossWinnerTeamId: away.id,
      tossDecision: 'bat',
      openingStrikerId: awayIds[0],
      openingNonStrikerId: awayIds[1],
      openingBowlerId: homeIds[6],
    })
  ).match;
  console.log(`✓ Match created: /m/${match.id}`);

  // ── Scoring ───────────────────────────────────────────────────────────────
  let placementIndex = 0;

  /**
   * Bowl until a stopping condition, keeping the state the server reports.
   *
   * Strike is read back rather than tracked: the engine rotates it, and a
   * script that guesses is how the wrong batter ends up at the wrong end. The
   * one thing that has to be supplied is the **incoming batter after a
   * wicket** — the engine deliberately leaves the dismissed player in place,
   * because only the scorer knows who walks in.
   */
  async function bowl(
    startState: Live,
    bowlingIds: string[],
    battingIds: string[],
    stopAtBalls: number,
  ): Promise<Live> {
    let state = startState;
    let ball = 0;
    let nextBatter = 2; // openers are 0 and 1
    let bowler = state.currentBowlerId;
    let lastBowler = '';

    while (state.ballsBowled < stopAtBalls && state.status === 'in_progress' && ball < 400) {
      const runs = OVER_PATTERN[ball % OVER_PATTERN.length]!;
      // A wicket roughly every fourteen deliveries, never on the first ball of
      // the innings and never once the tail would be exposed past the squad.
      const isWicket = ball > 4 && ball % 14 === 0 && nextBatter < battingIds.length;

      const body: Json = {
        inningsId: state.inningsId,
        eventType: isWicket ? 'wicket' : runs === 0 ? 'dot' : String(runs),
        runsOffBat: isWicket ? 0 : runs,
        extraRuns: 0,
        totalRuns: isWicket ? 0 : runs,
        batsmanId: state.strikerId,
        nonStrikerId: state.nonStrikerId,
        bowlerId: bowler,
        ...(isWicket ? { wicketType: 'bowled' as const, wicketPlayerId: state.strikerId } : {}),
      };

      // Placement on boundaries only. That is what a wagon wheel is read for,
      // and holding the key for every single is not what a scorer would do.
      if (!isWicket && (runs === 4 || runs === 6)) {
        // Cycled rather than consumed. A single running index spent the whole
        // list on the first innings, so the chase — the innings the wagon
        // wheel screenshot is actually of — came out empty.
        const p = PLACEMENTS[placementIndex % PLACEMENTS.length]!;
        placementIndex += 1;
        body.shotAngle = p.angle;
        body.shotDistance = p.distance;
      }

      const res = await call('POST', `/api/matches/${match.id}/ball`, body);
      state = liveFrom(res);
      ball += 1;
      await sleep(BALL_INTERVAL_MS);

      // The incoming batter. The engine leaves the dismissed player as striker
      // until somebody says who replaced them, so this is supplied rather than
      // read back.
      if (isWicket) {
        state = { ...state, strikerId: battingIds[nextBatter]! };
        nextBatter += 1;
      }

      // End of an over: someone else bowls. Law 16.2 refuses two in a row, so
      // the previous bowler is excluded rather than hoped against.
      if (state.ballsBowled > 0 && state.ballsBowled % 6 === 0) {
        lastBowler = bowler;
        const options = bowlingIds.slice(4).filter((id) => id !== lastBowler);
        bowler = options[(state.ballsBowled / 6) % options.length]!;
      }
    }
    return state;
  }

  // First innings — HSR Strikers, twenty overs.
  let live = liveFrom(await call('GET', `/api/matches/${match.id}/scorer`));
  live = await bowl(live, homeIds, awayIds, 120);
  console.log(`✓ ${AWAY}: ${live.runs}-${live.wickets} (${overs(live.ballsBowled)})`);

  await call('POST', `/api/matches/${match.id}/innings/end`);

  // Second innings — the chase, stopped mid-over so the console has something
  // live to show. This is the frame the whole listing is built around.
  await call('POST', `/api/matches/${match.id}/innings`, {
    openingStrikerId: homeIds[0],
    openingNonStrikerId: homeIds[1],
    openingBowlerId: awayIds[6],
  });
  // Starting an innings answers with `{ inning }` — the row — rather than the
  // replayed `{ state }` every ball response carries. The scorer endpoint is
  // what the console reads on arriving at a fresh innings, so it is what this
  // reads too.
  live = liveFrom(await call('GET', `/api/matches/${match.id}/scorer`));
  live = await bowl(live, awayIds, homeIds, 106);
  console.log(`✓ ${HOME}: ${live.runs}-${live.wickets} (${overs(live.ballsBowled)}) — chasing`);

  /*
   * Name the batter the wheel actually looks best on, rather than assuming the
   * opener. Which player accumulates boundaries depends on where wickets fall,
   * so it is read back from the card the app itself renders.
   */
  const card = await call('GET', `/api/matches/${match.id}/card`);
  const chase = card.innings?.[1] ?? card.innings?.[0];
  const shotsBy: Record<string, number> = {};
  for (const d of chase?.deliveries ?? []) {
    if (d.shotAngle !== null && d.shotAngle !== undefined) {
      shotsBy[d.batsmanName] = (shotsBy[d.batsmanName] ?? 0) + 1;
    }
  }
  const [bestName, bestShots] = Object.entries(shotsBy).sort((a, b) => b[1] - a[1])[0] ?? ['—', 0];
  const topScorer = [...(chase?.batting ?? [])].sort((a, b) => b.runs - a.runs)[0];
  const needed = (chase?.target ?? 0) - (chase?.runs ?? 0);

  console.log('');
  console.log('🏏 Done. Open the app signed in as this account.');
  console.log(`   Match       ${BASE}/m/${match.id}`);
  console.log(`   Chase       needs ${needed} to win`);
  if (topScorer) {
    console.log(`   Top scorer  ${topScorer.playerName} ${topScorer.runs}(${topScorer.balls})`);
  }
  console.log(`   Wheel       Card → Wheel, filter to ${bestName} (${bestShots} shots)`);
  console.log(`   Career      Players → ${bestName}`);
}

main().catch((err) => {
  console.error('✗ Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
