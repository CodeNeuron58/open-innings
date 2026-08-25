/**
 * What a guest sees before they have an account.
 *
 * `GET /api/matches/public` is the first endpoint in this app that is both
 * unauthenticated *and* a listing, so it is worth being explicit about what it
 * may and may not do.
 *
 * It discloses nothing new. `matches` is publicly readable by RLS, `/m/<id>`
 * is the link people share, and the card endpoint behind it takes no token —
 * every row here was already reachable by anyone who had the id. What the
 * endpoint adds is finding it without one.
 *
 * The checks below are the properties that make it safe and useful: no session
 * required, somebody else's live match is visible, an abandoned one is not,
 * live sorts above finished, and each row carries enough to be worth listing.
 *
 * Run against a disposable database. It creates two clubs and cleans up.
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

type Row = {
  id: string;
  status: string;
  teamAName: string | null;
  teamBName: string | null;
  innings: { runs: number; wickets: number }[];
};

async function main(): Promise<void> {
  console.log('the public feed');

  const auth = await call<{ token: string }>('/api/auth/signup', {
    method: 'POST',
    body: {
      email: `browse-smoke-${Date.now()}@local`,
      password: 'browsesmoke123',
      displayName: 'Browse smoke',
    },
  });
  if (!auth.body.token) {
    console.error('Could not create a smoke account.', JSON.stringify(auth.body));
    process.exit(1);
  }
  const token = auth.body.token;
  const stamp = Date.now();

  const teamIds: string[] = [];
  const squads: string[][] = [];
  for (const side of ['Home', 'Away']) {
    const team = await call<{ team: { id: string } }>('/api/teams', {
      method: 'POST',
      token,
      body: { name: `Browse ${side} ${stamp}` },
    });
    teamIds.push(team.body.team.id);
    const ids: string[] = [];
    for (let i = 0; i < 4; i += 1) {
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
    squads.push(ids);
  }

  const [bat, bowl] = squads as [string[], string[]];

  const newMatch = async (title: string) => {
    const r = await call<{ match: { id: string } }>('/api/matches', {
      method: 'POST',
      token,
      body: {
        title,
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
    return r.body.match.id;
  };

  const liveId = await newMatch(`Browse live ${stamp}`);
  const goneId = await newMatch(`Browse abandoned ${stamp}`);

  await call(`/api/matches/${goneId}/abandon`, {
    method: 'POST',
    token,
    body: { reason: 'smoke test' },
  });

  // Read it the way a guest does: no header at all.
  const feed = await call<{ matches: Row[] }>('/api/matches/public');

  check('no session is needed', feed.status === 200, feed.status);

  const rows = feed.body.matches ?? [];
  const mine = rows.find((m) => m.id === liveId);

  check('a live match is visible without an account', mine !== undefined);
  check(
    'an abandoned match is not listed',
    !rows.some((m) => m.id === goneId),
    'a no result belongs on the club’s page, not in front of a first-time reader',
  );

  check('the row names both sides', Boolean(mine?.teamAName && mine?.teamBName), {
    a: mine?.teamAName,
    b: mine?.teamBName,
  });
  check('and carries its innings, so a score can be shown', Array.isArray(mine?.innings));

  const firstFinished = rows.findIndex((m) => m.status !== 'live');
  const liveCount = rows.filter((m) => m.status === 'live').length;
  check(
    'live matches sort above finished ones',
    liveCount === 0 || firstFinished === -1 || firstFinished === liveCount,
    rows.map((m) => m.status),
  );

  // The listing is a way in, not a directory.
  check('the listing is capped', rows.length <= 30, rows.length);

  await call(`/api/matches/${liveId}/abandon`, {
    method: 'POST',
    token,
    body: { reason: 'smoke test' },
  });
  for (const id of [liveId, goneId]) {
    await call(`/api/matches/${id}`, { method: 'DELETE', token });
  }

  console.log(
    failed === 0
      ? `\n🏏 browse-smoke: all ${passed} checks passed`
      : `\n✗ browse-smoke: ${failed} of ${passed + failed} checks failed`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

void main();
