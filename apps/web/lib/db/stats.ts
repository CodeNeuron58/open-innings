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
import {
  BATSMAN_FACING_EXCLUDED_TYPES,
  BOWLER_CREDITED_WICKETS,
  BOWLER_EXEMPT_EXTRAS,
  TEAM_WICKET_COUNTED,
} from '@open-innings/scoring';
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

/**
 * Event types that never enter a bowler's runs conceded — Law 24's byes and
 * leg-byes. Imported from the engine so the figure a career page shows cannot
 * drift from the one on the scorecard the same balls produced.
 */
const exemptExtras = enumList(BOWLER_EXEMPT_EXTRAS);

/**
 * Deliveries that are not a ball faced — a wide, and nothing else. Imported
 * so the strike rate on a career page matches the one on the scorecard the
 * same balls produced.
 */
const notFaced = enumList(BATSMAN_FACING_EXCLUDED_TYPES);

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
      -- There is no single "match date": a finished game is dated by when it
      -- finished, a live one by when it started, an unplayed one by when it
      -- was scheduled. created_at is the last resort so this is never null.
      coalesce(m.completed_at, m.started_at, m.scheduled_at, m.created_at) as played_at,
      bowl_team.name as opponent,
      -- Every figure below is scoped to deliveries this player actually faced.
      --
      -- The WHERE clause below deliberately widens to include balls where they
      -- were only the *dismissed* player, so that a non-striker run out
      -- without facing a ball still produces an innings row. Without these
      -- filters that widening leaked: the ball on which they were run out at
      -- the bowler's end brought the striker's runs and a phantom ball faced
      -- into their innings.
      coalesce(sum(be.runs_off_bat) filter (where be.batsman_id = ${playerId}::uuid), 0)::int
        as runs,
      -- Balls faced is every delivery except a wide — byes and leg-byes were
      -- faced, and so was a no-ball. The exempt list is imported from the
      -- engine so a career page and a match card cannot disagree.
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
    playedAt: new Date(r.played_at),
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
      -- Byes and leg-byes are not charged to the bowler; the wide and no-ball
      -- penalties are. The exempt list is imported from the engine rather than
      -- written out here, so this cannot drift from what a scorecard shows.
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

// ─────────────────────────────────────────────────────────────────────────────
// Many players at once
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enough of a career to decide whether this is the right person.
 *
 * Not a shrunken `PlayerCareer` — a different question. The career page is
 * read about one player who has been chosen; this is read while *choosing*,
 * across a whole squad, and the only figures that help are the ones that
 * distinguish two people with the same name.
 */
export type CareerBrief = {
  playerId: string;
  matches: number;
  runs: number;
  battingBalls: number;
  wickets: number;
  bowlingRuns: number;
  bowlingBalls: number;
};

/**
 * Career totals for a list of players, in two queries rather than 2N.
 *
 * The reason this exists: three screens want a line of context beside each
 * name in a list — the XI picker, the openers picker, and the add-a-player
 * search. Calling the per-player endpoint per row is twenty-two round trips
 * on a screen someone is trying to get past, on ground-side mobile data.
 *
 * Totals, not per-innings rows. Nothing here needs an innings breakdown, and
 * folding one for twenty-two players to produce six numbers each would move
 * the same waste from the network to the server.
 */
export async function careerBriefsFor(playerIds: string[]): Promise<CareerBrief[]> {
  if (playerIds.length === 0) return [];

  const ids = sql.join(
    playerIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const credited = enumList(BOWLER_CREDITED_WICKETS);

  const [battingRows, bowlingRows] = await Promise.all([
    db.execute<{ player_id: string; runs: number; balls: number; matches: number }>(sql`
      select
        be.batsman_id as player_id,
        coalesce(sum(be.runs_off_bat), 0)::int as runs,
        -- Every delivery except a wide, same rule as battingInningsFor and
        -- the engine, from the same imported list.
        count(*) filter (where be.event_type not in (${notFaced}))::int as balls,
        count(distinct i.match_id)::int as matches
      from ball_events be
      join innings i on i.id = be.innings_id
      where be.batsman_id in (${ids})
      group by be.batsman_id
    `),
    db.execute<{
      player_id: string;
      balls: number;
      runs: number;
      wickets: number;
      matches: number;
    }>(sql`
      select
        be.bowler_id as player_id,
        count(*) filter (where be.is_legal_delivery)::int as balls,
        -- Byes and leg-byes are not charged to the bowler; the wide and
        -- no-ball penalties are. Same imported list as bowlingInningsFor — if
        -- these two ever disagree, one screen contradicts another.
        coalesce(sum(be.total_runs) filter (
          where be.event_type not in (${exemptExtras})
        ), 0)::int as runs,
        count(*) filter (where be.wicket_type in (${credited}))::int as wickets,
        count(distinct i.match_id)::int as matches
      from ball_events be
      join innings i on i.id = be.innings_id
      where be.bowler_id in (${ids})
      group by be.bowler_id
    `),
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

  // Matches are counted per role, so an all-rounder appears in both result
  // sets for the same game. The union has to be taken over match ids, which
  // neither query returns — so the larger of the two is used. It is exact
  // whenever a player bowled in every match they batted in or vice versa,
  // which covers a specialist entirely, and never overcounts.
  for (const r of battingRows) {
    const brief = byPlayer.get(r.player_id) ?? blank(r.player_id);
    brief.runs = Number(r.runs);
    brief.battingBalls = Number(r.balls);
    brief.matches = Math.max(brief.matches, Number(r.matches));
    byPlayer.set(r.player_id, brief);
  }
  for (const r of bowlingRows) {
    const brief = byPlayer.get(r.player_id) ?? blank(r.player_id);
    brief.wickets = Number(r.wickets);
    brief.bowlingRuns = Number(r.runs);
    brief.bowlingBalls = Number(r.balls);
    brief.matches = Math.max(brief.matches, Number(r.matches));
    byPlayer.set(r.player_id, brief);
  }

  // Everyone asked about, including players who have never faced a ball —
  // a caller should not have to distinguish "no record" from "not returned".
  return playerIds.map((id) => byPlayer.get(id) ?? blank(id));
}
