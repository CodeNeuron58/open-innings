/**
 * The playing XI is sized from the people at the ground.
 *
 * The bug this proves gone: `createMatchWithFirstInnings` read
 * `getTeamMembers()` — the club's whole registered roster — for both sides, so
 * a seven-a-side game played out of a twelve-player roster was given ten
 * wickets and could not end the way it was actually played.
 *
 * The unit tests in `lib/services/matches.test.ts` assert the arithmetic. This
 * asserts the wiring: that what the wizard sends reaches `match_squads`, and
 * that the innings created from it is sized from the XI rather than the books.
 * Neither half is provable without a database, which is why it is a smoke test
 * and not a unit test.
 *
 * Run against a disposable database — it creates a club and deletes it again.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as T };
}

async function main(): Promise<void> {
  console.log('playing XI');

  /*
   * A throwaway account, not the seeded one.
   *
   * `api-smoke` deliberately exhausts the login rate limiter — it has a check
   * that repeated failures eventually 429 — and that bucket outlives the run
   * by fifteen minutes. Signing up sidesteps it, and a fresh owner also means
   * this test cannot see or disturb anybody else's clubs.
   */
  const auth = await call<{ token: string }>('/api/auth/signup', {
    method: 'POST',
    body: {
      email: `xi-smoke-${Date.now()}@local`,
      password: 'xismokepassword123',
      displayName: 'XI smoke',
    },
  });
  if (!auth.body.token) {
    console.error('Could not create a smoke account.', JSON.stringify(auth.body));
    process.exit(1);
  }
  const token = auth.body.token;

  // A club of twelve, of which seven turn out. The gap between those two
  // numbers is the entire bug.
  const ROSTER = 12;
  const XI = 7;

  const stamp = Date.now();
  const teams: string[] = [];
  const players: string[][] = [];

  for (const side of ['Home', 'Away']) {
    const team = await call<{ team: { id: string } }>('/api/teams', {
      method: 'POST',
      token,
      body: { name: `XI smoke ${side} ${stamp}` },
    });
    teams.push(team.body.team.id);

    const ids: string[] = [];
    for (let i = 0; i < ROSTER; i += 1) {
      const player = await call<{ player: { id: string } }>('/api/players', {
        method: 'POST',
        token,
        body: { fullName: `${side} ${i + 1} ${stamp}` },
      });
      ids.push(player.body.player.id);
      await call(`/api/teams/${team.body.team.id}/members`, {
        method: 'POST',
        token,
        body: { playerId: player.body.player.id },
      });
    }
    players.push(ids);
  }

  const [homeId, awayId] = teams as [string, string];
  const [homePlayers, awayPlayers] = players as [string[], string[]];

  const homeXI = homePlayers.slice(0, XI);
  const awayXI = awayPlayers.slice(0, XI);

  const created = await call<{ match: { id: string }; inning: { maxWickets: number } }>(
    '/api/matches',
    {
      method: 'POST',
      token,
      body: {
        title: `XI smoke ${stamp}`,
        oversPerInnings: 20,
        teamAId: homeId,
        teamBId: awayId,
        teamAPlayerIds: homeXI,
        teamBPlayerIds: awayXI,
        openingStrikerId: homeXI[0],
        openingNonStrikerId: homeXI[1],
        openingBowlerId: awayXI[0],
      },
    },
  );

  check('a match with a named XI is created', created.status === 201, JSON.stringify(created.body));

  // Six, not ten. Ten is what the roster would have given, and ten is a number
  // of wickets a side of seven can never lose.
  check(
    `innings sized for the XI — ${XI} players means ${XI - 1} wickets`,
    created.body.inning?.maxWickets === XI - 1,
    `got ${created.body.inning?.maxWickets}`,
  );

  const matchId = created.body.match.id;

  const scorer = await call<{
    battingSquad: { id: string }[];
    bowlingSquad: { id: string }[];
  }>(`/api/matches/${matchId}/scorer`, { token });

  check(
    'the scorer sees the XI, not the roster, for the batting side',
    scorer.body.battingSquad?.length === XI,
    `got ${scorer.body.battingSquad?.length}`,
  );
  check(
    'and for the fielding side — this is the wicket sheet’s fielder list',
    scorer.body.bowlingSquad?.length === XI,
    `got ${scorer.body.bowlingSquad?.length}`,
  );

  // Naming somebody who is not on the club's books must be refused: an XI is a
  // subset of the roster, not a second way to add people to it.
  const stranger = await call('/api/matches', {
    method: 'POST',
    token,
    body: {
      oversPerInnings: 20,
      teamAId: homeId,
      teamBId: awayId,
      teamAPlayerIds: [homeXI[0], homeXI[1], awayPlayers[11]],
      teamBPlayerIds: awayXI,
      openingStrikerId: homeXI[0],
      openingNonStrikerId: homeXI[1],
      openingBowlerId: awayXI[0],
    },
  });
  check('an XI cannot name somebody off another club’s books', stranger.status === 400);

  // Omitting the XI still means "the whole roster" — the compatibility
  // contract every match created before migration 0018 depends on.
  const legacy = await call<{ inning: { maxWickets: number } }>('/api/matches', {
    method: 'POST',
    token,
    body: {
      oversPerInnings: 20,
      teamAId: homeId,
      teamBId: awayId,
      openingStrikerId: homePlayers[0],
      openingNonStrikerId: homePlayers[1],
      openingBowlerId: awayPlayers[0],
    },
  });
  check(
    'omitting the XI still falls back to the whole roster',
    legacy.body.inning?.maxWickets === 10,
    `got ${legacy.body.inning?.maxWickets} (roster of ${ROSTER}, capped at 10)`,
  );

  // Tidy up. Both matches have to be abandoned before they can be deleted.
  for (const id of [matchId, (legacy.body as { match?: { id: string } }).match?.id]) {
    if (!id) continue;
    await call(`/api/matches/${id}/abandon`, {
      method: 'POST',
      token,
      body: { reason: 'smoke test' },
    });
    await call(`/api/matches/${id}`, { method: 'DELETE', token });
  }

  console.log(
    failed === 0
      ? `\n🏏 xi-smoke: all ${passed} checks passed`
      : `\n✗ xi-smoke: ${failed} of ${passed + failed} checks failed`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

void main();
