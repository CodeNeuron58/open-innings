/**
 * Career statistics derived on the fly from the ball log.
 * Rules for dismissals and extras are imported from the scoring engine.
 */
import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import {
  BATSMAN_FACING_EXCLUDED_TYPES,
  BOWLER_CREDITED_WICKETS,
  BOWLER_EXEMPT_EXTRAS,
  TEAM_WICKET_COUNTED,
} from '@open-innings/scoring';
import { db } from './client';

/** Renders a set of strings as a bound parameter list for `in (…)`. */
function enumList(values: ReadonlySet<string>): SQL {
  return sql.join(
    [...values].map((v) => sql`${v}`),
    sql`, `,
  );
}

/** Event types that do not count against a bowler's runs conceded. */
const exemptExtras = enumList(BOWLER_EXEMPT_EXTRAS);

/** Deliveries that are not counted as a ball faced by the batter. */
export const notFaced = enumList(BATSMAN_FACING_EXCLUDED_TYPES);

/** One innings of batting. */
export type BattingInnings = {
  inningsId: string;
  matchId: string;
  playedAt: Date;
  opponent: string | null;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  /** False when the batter finished not out — the denominator of an average. */
  isOut: boolean;
};

/** One innings of bowling. */
export type BowlingInnings = {
  inningsId: string;
  matchId: string;
  playedAt: Date;
  opponent: string | null;
  balls: number;
  runs: number;
  wickets: number;
};

export type FieldingTotals = {
  catches: number;
  runOuts: number;
  stumpings: number;
};

/** Every innings this player has batted in, newest first. */
export async function battingInningsFor(playerId: string): Promise<BattingInnings[]> {
  const dismissals = enumList(TEAM_WICKET_COUNTED);

  const rows = await db.execute<{
    innings_id: string;
    match_id: string;
    // Raw driver row: db.execute bypasses drizzle type mapping, so this
    // arrives as whatever postgres.js hands back — a string, not a Date.
    played_at: string | Date;
    opponent: string | null;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    is_out: boolean;
  }>(sql`
    select
      be.innings_id,
      m.id as match_id,
      -- Coalesce dates to find closest match played date.
      coalesce(m.completed_at, m.started_at, m.scheduled_at, m.created_at) as played_at,
      bowl_team.name as opponent,
      -- Filter by batsman_id to exclude runs scored by the striker when this player is run out at the non-striker's end.
      coalesce(sum(be.runs_off_bat) filter (where be.batsman_id = ${playerId}::uuid), 0)::int
        as runs,
      -- Count balls faced, exempting wides.
      count(*) filter (
        where be.batsman_id = ${playerId}::uuid
          and be.event_type not in (${notFaced})
      )::int as balls,
      count(*) filter (
        where be.batsman_id = ${playerId}::uuid and be.runs_off_bat = 4
      )::int as fours,
      count(*) filter (
        where be.batsman_id = ${playerId}::uuid and be.runs_off_bat = 6
      )::int as sixes,
      -- Check if player was dismissed (including non-striker run outs).
      coalesce(bool_or(
        be.wicket_player_id = ${playerId}::uuid
        and be.wicket_type in (${dismissals})
      ), false) as is_out
    from ball_events be
    join innings i on i.id = be.innings_id
    join matches m on m.id = i.match_id
    left join teams bowl_team on bowl_team.id = i.bowling_team_id
    where be.batsman_id = ${playerId}::uuid
       or be.wicket_player_id = ${playerId}::uuid
    group by be.innings_id, m.id, m.completed_at, m.started_at, m.scheduled_at, m.created_at, bowl_team.name
    order by played_at desc nulls last
  `);

  return rows.map((r) => ({
    inningsId: r.innings_id,
    matchId: r.match_id,
    playedAt: new Date(r.played_at),
    opponent: r.opponent,
    runs: Number(r.runs),
    balls: Number(r.balls),
    fours: Number(r.fours),
    sixes: Number(r.sixes),
    isOut: r.is_out,
  }));
}

/** Every innings this player has bowled in, newest first. */
export async function bowlingInningsFor(playerId: string): Promise<BowlingInnings[]> {
  const credited = enumList(BOWLER_CREDITED_WICKETS);

  const rows = await db.execute<{
    innings_id: string;
    match_id: string;
    // Raw driver row: db.execute bypasses drizzle type mapping, so this
    // arrives as whatever postgres.js hands back — a string, not a Date.
    played_at: string | Date;
    opponent: string | null;
    balls: number;
    runs: number;
    wickets: number;
  }>(sql`
    select
      be.innings_id,
      m.id as match_id,
      -- There is no single "match date": a finished game is dated by when it
      -- finished, a live one by when it started, an unplayed one by when it
      -- was scheduled. created_at is the last resort so this is never null.
      coalesce(m.completed_at, m.started_at, m.scheduled_at, m.created_at) as played_at,
      bat_team.name as opponent,
      count(*) filter (where be.is_legal_delivery)::int as balls,
      -- Calculate runs conceded, exempting byes/leg-byes.
      coalesce(sum(be.total_runs) filter (
        where be.event_type not in (${exemptExtras})
      ), 0)::int as runs,
      count(*) filter (
        where be.wicket_type in (${credited})
      )::int as wickets
    from ball_events be
    join innings i on i.id = be.innings_id
    join matches m on m.id = i.match_id
    left join teams bat_team on bat_team.id = i.batting_team_id
    where be.bowler_id = ${playerId}::uuid
    group by be.innings_id, m.id, m.completed_at, m.started_at, m.scheduled_at, m.created_at, bat_team.name
    order by played_at desc nulls last
  `);

  return rows.map((r) => ({
    inningsId: r.innings_id,
    matchId: r.match_id,
    playedAt: new Date(r.played_at),
    opponent: r.opponent,
    balls: Number(r.balls),
    runs: Number(r.runs),
    wickets: Number(r.wickets),
  }));
}

/** Catches, run-outs and stumpings. */
export async function fieldingTotalsFor(playerId: string): Promise<FieldingTotals> {
  const rows = await db.execute<{ catches: number; run_outs: number; stumpings: number }>(sql`
    select
      count(*) filter (where be.wicket_type in ('caught', 'caught_behind'))::int as catches,
      count(*) filter (where be.wicket_type = 'run_out')::int as run_outs,
      count(*) filter (where be.wicket_type = 'stumped')::int as stumpings
    from ball_events be
    where be.fielder_id = ${playerId}::uuid
  `);

  const r = rows[0];
  return {
    catches: Number(r?.catches ?? 0),
    runOuts: Number(r?.run_outs ?? 0),
    stumpings: Number(r?.stumpings ?? 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Many players at once
// ─────────────────────────────────────────────────────────────────────────────

/** Matches each player appeared in, counting any role (batter, bowler, fielder, non-striker). */
export async function appearancesFor(playerIds: string[]): Promise<Map<string, number>> {
  if (playerIds.length === 0) return new Map();

  const ids = sql.join(
    playerIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  const rows = await db.execute<{ player_id: string; matches: number }>(sql`
    select roles.player_id, count(distinct roles.match_id)::int as matches
    from (
      select
        unnest(array[
          be.batsman_id, be.non_striker_id, be.bowler_id,
          be.fielder_id, be.wicket_player_id
        ]) as player_id,
        i.match_id
      from ball_events be
      join innings i on i.id = be.innings_id
    ) roles
    where roles.player_id in (${ids})
    group by roles.player_id
  `);

  return new Map(rows.map((r) => [r.player_id, Number(r.matches)]));
}

/** Basic career stats to help disambiguate players with the same name. */
export type CareerBrief = {
  playerId: string;
  matches: number;
  runs: number;
  battingBalls: number;
  wickets: number;
  bowlingRuns: number;
  bowlingBalls: number;
};

/** Bulk career totals for a list of players. */
export async function careerBriefsFor(playerIds: string[]): Promise<CareerBrief[]> {
  if (playerIds.length === 0) return [];

  const ids = sql.join(
    playerIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const credited = enumList(BOWLER_CREDITED_WICKETS);

  const [battingRows, bowlingRows, appearances] = await Promise.all([
    db.execute<{ player_id: string; runs: number; balls: number }>(sql`
      select
        be.batsman_id as player_id,
        coalesce(sum(be.runs_off_bat), 0)::int as runs,
        -- Count balls faced, exempting wides.
        count(*) filter (where be.event_type not in (${notFaced}))::int as balls
      from ball_events be
      where be.batsman_id in (${ids})
      group by be.batsman_id
    `),
    db.execute<{
      player_id: string;
      balls: number;
      runs: number;
      wickets: number;
    }>(sql`
      select
        be.bowler_id as player_id,
        count(*) filter (where be.is_legal_delivery)::int as balls,
        -- Calculate runs conceded, exempting byes/leg-byes.
        coalesce(sum(be.total_runs) filter (
          where be.event_type not in (${exemptExtras})
        ), 0)::int as runs,
        count(*) filter (where be.wicket_type in (${credited}))::int as wickets
      from ball_events be
      where be.bowler_id in (${ids})
      group by be.bowler_id
    `),
    appearancesFor(playerIds),
  ]);

  const byPlayer = new Map<string, CareerBrief>();
  const blank = (playerId: string): CareerBrief => ({
    playerId,
    matches: 0,
    runs: 0,
    battingBalls: 0,
    wickets: 0,
    bowlingRuns: 0,
    bowlingBalls: 0,
  });

  // Use appearancesFor to count matches played in any role.
  for (const r of battingRows) {
    const brief = byPlayer.get(r.player_id) ?? blank(r.player_id);
    brief.runs = Number(r.runs);
    brief.battingBalls = Number(r.balls);
    byPlayer.set(r.player_id, brief);
  }
  for (const r of bowlingRows) {
    const brief = byPlayer.get(r.player_id) ?? blank(r.player_id);
    brief.wickets = Number(r.wickets);
    brief.bowlingRuns = Number(r.runs);
    brief.bowlingBalls = Number(r.balls);
    byPlayer.set(r.player_id, brief);
  }
  for (const [playerId, matches] of appearances) {
    const brief = byPlayer.get(playerId) ?? blank(playerId);
    brief.matches = matches;
    byPlayer.set(playerId, brief);
  }

  // Return a brief for every requested ID, using blanks if no record.
  return playerIds.map((id) => byPlayer.get(id) ?? blank(id));
}
