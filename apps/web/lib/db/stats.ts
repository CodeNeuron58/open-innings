/**
 * Career statistics, derived from the ball log.
 *
 * Nothing here is stored. Every figure on a player's profile is computed from
 * `ball_events`, which is the same source the scorecard replays from — so a
 * corrected ball fixes the career record too, and there is no aggregate table
 * to drift out of step with the balls that produced it.
 *
 * **The dismissal rules are imported, never retyped.** Which dismissals credit
 * the bowler is Law 25, and `packages/scoring/src/rules.ts` already encodes it
 * with the law references. Writing that list again as a SQL literal would
 * create a second source of truth that silently disagrees the first time
 * someone adds a dismissal type — so the sets are injected into the query
 * instead.
 *
 * Shape of the work: two queries return one row per innings the player batted
 * or bowled in, and the totals are folded in TypeScript. That is deliberate
 * rather than aggregating in SQL — a career is tens to low hundreds of rows,
 * and it means high score, fifties, best figures and recent form all fall out
 * of the same data without a query each.
 */
import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { BOWLER_CREDITED_WICKETS, TEAM_WICKET_COUNTED } from '@open-innings/scoring';
import { db } from './client';

/**
 * Renders a set of dismissal types as a bound parameter list for `in (…)`.
 *
 * Not `= any(${[...set]}::wicket_type[])` — drizzle binds a JS array as a
 * single row parameter, and Postgres rejects it with "cannot cast type record
 * to wicket_type[]". Joining one parameter per value keeps the values bound
 * (no string interpolation into SQL) and lets Postgres coerce each text
 * literal to the enum on comparison.
 */
function enumList(values: ReadonlySet<string>): SQL {
  return sql.join(
    [...values].map((v) => sql`${v}`),
    sql`, `,
  );
}

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

/**
 * Every innings this player has batted in, newest first.
 *
 * `is_out` counts only dismissals that end an innings — a retired hurt batter
 * can come back, so it is not an out and must not enter the average.
 */
export async function battingInningsFor(playerId: string): Promise<BattingInnings[]> {
  const dismissals = enumList(TEAM_WICKET_COUNTED);

  const rows = await db.execute<{
    innings_id: string;
    match_id: string;
    played_at: Date;
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
      -- There is no single "match date": a finished game is dated by when it
      -- finished, a live one by when it started, an unplayed one by when it
      -- was scheduled. created_at is the last resort so this is never null.
      coalesce(m.completed_at, m.started_at, m.scheduled_at, m.created_at) as played_at,
      bowl_team.name as opponent,
      coalesce(sum(be.runs_off_bat), 0)::int as runs,
      -- Balls faced excludes wides: a wide is not a ball the batter faced.
      count(*) filter (where be.is_legal_delivery)::int as balls,
      count(*) filter (where be.runs_off_bat = 4)::int as fours,
      count(*) filter (where be.runs_off_bat = 6)::int as sixes,
      -- The dismissal is recorded against wicket_player_id, which is not
      -- always the striker: a run-out can take the non-striker.
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
    playedAt: r.played_at,
    opponent: r.opponent,
    runs: Number(r.runs),
    balls: Number(r.balls),
    fours: Number(r.fours),
    sixes: Number(r.sixes),
    isOut: r.is_out,
  }));
}

/**
 * Every innings this player has bowled in, newest first.
 *
 * Runs conceded charges the bowler for wides and no-balls but not for byes or
 * leg-byes — those came off the keeper or the pad, and Law 24 does not put
 * them on the bowler's analysis.
 */
export async function bowlingInningsFor(playerId: string): Promise<BowlingInnings[]> {
  const credited = enumList(BOWLER_CREDITED_WICKETS);

  const rows = await db.execute<{
    innings_id: string;
    match_id: string;
    played_at: Date;
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
      (
        coalesce(sum(be.runs_off_bat), 0)
        + coalesce(sum(be.extra_runs) filter (
            where be.event_type in ('wide', 'no_ball')
          ), 0)
      )::int as runs,
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
    playedAt: r.played_at,
    opponent: r.opponent,
    balls: Number(r.balls),
    runs: Number(r.runs),
    wickets: Number(r.wickets),
  }));
}

/**
 * Catches, run-outs and stumpings.
 *
 * A stumping is the keeper's, and it also credits the bowler — both are true
 * at once, so it appears here and in the bowler's wickets.
 */
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
