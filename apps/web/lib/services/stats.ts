/**
 * A player's career record, transport-free.
 *
 * Everything here is folded from the per-innings rows in `lib/db/stats.ts`.
 * Nothing is stored, so a corrected ball corrects the career.
 */
import 'server-only';
import type { BattingStyle, BowlingStyle, PlayerRole } from '@open-innings/shared';
import {
  appearancesFor,
  battingInningsFor,
  bowlingInningsFor,
  fieldingTotalsFor,
  type BattingInnings,
  type BowlingInnings,
} from '@/lib/db/stats';
import { getPlayer } from '@/lib/db/queries';
import { notFound } from './errors';

/** How many recent innings the profile shows as "form". */
const FORM_LENGTH = 5;

export type BattingCareer = {
  innings: number;
  notOuts: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  highScore: number;
  /** True when the highest score was an unbeaten one — rendered as "84*". */
  highScoreNotOut: boolean;
  fifties: number;
  hundreds: number;
  /** Runs per dismissal. Null when never out — an average needs a denominator. */
  average: number | null;
  strikeRate: number | null;
};

export type BowlingCareer = {
  innings: number;
  balls: number;
  runs: number;
  wickets: number;
  bestWickets: number;
  bestRuns: number;
  fiveFors: number;
  /** Runs per wicket. Null when wicketless. */
  average: number | null;
  /** Runs per over. */
  economy: number | null;
  /** Balls per wicket. Null when wicketless. */
  strikeRate: number | null;
};

export type FormEntry = {
  matchId: string;
  playedAt: Date | null;
  opponent: string | null;
  runs: number;
  balls: number;
  notOut: boolean;
};

export type PlayerCareer = {
  player: {
    id: string;
    fullName: string;
    // The enums, not `string` — this object is returned straight down the
    // wire as `PlayerCareerResponse`, and widening here would only move the
    // mismatch to the route handler.
    role: PlayerRole | null;
    battingStyle: BattingStyle | null;
    bowlingStyle: BowlingStyle | null;
  };
  /** Distinct matches played — not batting innings plus bowling innings. */
  matches: number;
  batting: BattingCareer;
  bowling: BowlingCareer;
  fielding: { catches: number; runOuts: number; stumpings: number };
  /**
   * The same figures for the current season only.
   *
   * "This season" is what people actually check — a career average is a slow
   * number that barely moves, while this season's is the one being argued
   * about in the group chat. Null when the player hasn't played this season,
   * so the page can omit the block rather than print a row of zeroes.
   */
  season: { label: string; batting: BattingCareer; bowling: BowlingCareer } | null;
  form: FormEntry[];
  milestones: Milestone[];
};

/**
 * Something worth mentioning, and how long ago it happened.
 *
 * `matchesAgo` counts *appearances*, not days — 0 is the most recent match a
 * player featured in. Someone who has not played since March should read
 * "two matches ago", not "five months ago", because the number is about form
 * rather than the calendar.
 */
export type Milestone = {
  label: string;
  matchesAgo: number;
};

/**
 * The cricket season a date falls in.
 *
 * Indian club cricket runs across the calendar year rather than the English
 * April-to-September split, so a season here is simply the year. Kept as one
 * function so that if this ever needs to become April–March, there is a single
 * place to change it.
 */
/*
 * The four functions below are exported for tests, not for callers.
 *
 * They are the only genuinely intricate logic in this file — high score and
 * its asterisk, best bowling figures, ordinals, and when a milestone happened
 * — and all four are pure. They were reachable only through `careerFor`,
 * which needs a database, so nothing could exercise them without one and
 * nothing did.
 *
 * Prefer `careerFor` from application code; it is the whole answer.
 */
export function seasonOf(date: Date): number {
  return date.getFullYear();
}

export function foldBatting(rows: BattingInnings[]): BattingCareer {
  const runs = rows.reduce((n, r) => n + r.runs, 0);
  const balls = rows.reduce((n, r) => n + r.balls, 0);
  const outs = rows.filter((r) => r.isOut).length;

  // The high score is the largest innings; if two match, an unbeaten one is
  // conventionally the better and is what gets the asterisk.
  let highScore = 0;
  let highScoreNotOut = false;
  for (const r of rows) {
    if (r.runs > highScore || (r.runs === highScore && !r.isOut)) {
      highScore = r.runs;
      highScoreNotOut = !r.isOut;
    }
  }

  return {
    innings: rows.length,
    notOuts: rows.length - outs,
    runs,
    balls,
    fours: rows.reduce((n, r) => n + r.fours, 0),
    sixes: rows.reduce((n, r) => n + r.sixes, 0),
    highScore,
    highScoreNotOut,
    // A hundred is not also counted as a fifty.
    fifties: rows.filter((r) => r.runs >= 50 && r.runs < 100).length,
    hundreds: rows.filter((r) => r.runs >= 100).length,
    average: outs > 0 ? runs / outs : null,
    strikeRate: balls > 0 ? (runs / balls) * 100 : null,
  };
}

export function foldBowling(rows: BowlingInnings[]): BowlingCareer {
  const balls = rows.reduce((n, r) => n + r.balls, 0);
  const runs = rows.reduce((n, r) => n + r.runs, 0);
  const wickets = rows.reduce((n, r) => n + r.wickets, 0);

  /*
   * Best figures are most wickets, then fewest runs — 5-20 beats 5-31, and
   * both beat 4-10.
   *
   * Ranked by comparing whole innings rather than by improving two loose
   * counters, which is what fixes the wicketless case. The previous version
   * seeded bestWickets and bestRuns at zero and required `wickets > 0` before
   * runs could break a tie, so a bowler who had never taken one reported best
   * figures of **0-0** — an over of nothing conceded, on a career page, for
   * somebody who had been hit around all season. A scorebook would say 0-8:
   * their least expensive spell.
   */
  let best: BowlingInnings | null = null;
  for (const r of rows) {
    if (!best || r.wickets > best.wickets || (r.wickets === best.wickets && r.runs < best.runs)) {
      best = r;
    }
  }
  const bestWickets = best?.wickets ?? 0;
  const bestRuns = best?.runs ?? 0;

  return {
    innings: rows.length,
    balls,
    runs,
    wickets,
    bestWickets,
    bestRuns,
    fiveFors: rows.filter((r) => r.wickets >= 5).length,
    average: wickets > 0 ? runs / wickets : null,
    economy: balls > 0 ? runs / (balls / 6) : null,
    strikeRate: wickets > 0 ? balls / wickets : null,
  };
}

/**
 * "Eighth fifty" rather than "8 fifties".
 *
 * A milestone is a moment, and moments are counted in ordinals. Words up to
 * tenth because those are the ones people say; past that the numeral is what
 * anyone would write anyway.
 */
const ORDINALS = [
  'First',
  'Second',
  'Third',
  'Fourth',
  'Fifth',
  'Sixth',
  'Seventh',
  'Eighth',
  'Ninth',
  'Tenth',
] as const;

export function ordinal(n: number): string {
  const word = ORDINALS[n - 1];
  if (word) return word;
  // 11th, 12th, 13th are the exceptions to the -st/-nd/-rd rule.
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/**
 * The milestones worth telling someone about, and when each happened.
 *
 * Deliberately few. A profile listing thirty achievements says nothing; three
 * that are actually rare say something. These are the ones a club cricketer
 * would mention in the bar.
 *
 * **Dated**, which is the difference between a statistic and a story:
 * "eighth fifty, two matches ago" says a player is in form, while "8 fifties"
 * says only that they have been around. That needs the innings walked in
 * order rather than folded, because a career total cannot say when it was
 * reached.
 *
 * Only the most recent of each kind survives — a thousand-run player has
 * crossed the fifty mark a dozen times, and listing all of them buries the
 * one that matters.
 */
export function milestonesFor(
  battingRows: BattingInnings[],
  bowlingRows: BowlingInnings[],
): Milestone[] {
  // Chronological position of every match this player appeared in, so
  // "matches ago" counts appearances rather than calendar time — a player who
  // missed two months has not had a milestone age by two months.
  const order = new Map<string, number>();
  [...battingRows, ...bowlingRows]
    .slice()
    .sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime())
    .forEach((r) => {
      if (!order.has(r.matchId)) order.set(r.matchId, order.size);
    });

  const lastIndex = order.size - 1;
  if (lastIndex < 0) return [];

  // One slot per kind; later crossings overwrite earlier ones.
  const latest = new Map<string, { label: string; at: number }>();
  const record = (kind: string, label: string, matchId: string) => {
    latest.set(kind, { label, at: order.get(matchId) ?? lastIndex });
  };

  const oldestFirst = <T extends { playedAt: Date }>(rows: T[]) =>
    rows.slice().sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());

  let runs = 0;
  let fifties = 0;
  let hundreds = 0;
  for (const r of oldestFirst(battingRows)) {
    const before = Math.floor(runs / 1000);
    runs += r.runs;
    // Crossed a thousand mark in this innings.
    if (Math.floor(runs / 1000) > before && runs >= 1000) {
      record('runs', `${Math.floor(runs / 1000) * 1000} career runs`, r.matchId);
    }
    if (r.runs >= 100) {
      hundreds += 1;
      record('hundreds', `${ordinal(hundreds)} century`, r.matchId);
    } else if (r.runs >= 50) {
      // A hundred is not also a fifty.
      fifties += 1;
      record('fifties', `${ordinal(fifties)} fifty`, r.matchId);
    }
  }

  let wickets = 0;
  let fiveFors = 0;
  for (const r of oldestFirst(bowlingRows)) {
    const before = Math.floor(wickets / 50);
    wickets += r.wickets;
    if (Math.floor(wickets / 50) > before && wickets >= 50) {
      record('wickets', `${Math.floor(wickets / 50) * 50} career wickets`, r.matchId);
    }
    if (r.wickets >= 5) {
      fiveFors += 1;
      record('fiveFors', `${ordinal(fiveFors)} five-for`, r.matchId);
    }
  }

  // Most recent first — the newest achievement is the one worth reading.
  return [...latest.values()]
    .map((m) => ({ label: m.label, matchesAgo: lastIndex - m.at }))
    .sort((a, b) => a.matchesAgo - b.matchesAgo);
}

export async function careerFor(playerId: string): Promise<PlayerCareer> {
  const player = await getPlayer(playerId);
  if (!player) throw notFound('Player not found');

  // Independent aggregates — no reason to wait for them in series.
  const [battingRows, bowlingRows, fielding, appearances] = await Promise.all([
    battingInningsFor(playerId),
    bowlingInningsFor(playerId),
    fieldingTotalsFor(playerId),
    appearancesFor([playerId]),
  ]);

  const batting = foldBatting(battingRows);
  const bowling = foldBowling(bowlingRows);

  // The current season is the newest one the player actually appears in, not
  // today's year — otherwise someone who last played in December sees an empty
  // block every January, which reads as "no record" rather than "off-season".
  const played = [...battingRows, ...bowlingRows].map((r) => seasonOf(r.playedAt));
  const latestSeason = played.length > 0 ? Math.max(...played) : null;

  const seasonBattingRows = battingRows.filter((r) => seasonOf(r.playedAt) === latestSeason);
  const seasonBowlingRows = bowlingRows.filter((r) => seasonOf(r.playedAt) === latestSeason);

  // Only worth showing when it differs from the career — a player whose whole
  // record is one season would otherwise see the same numbers twice.
  const seasonIsWholeCareer =
    seasonBattingRows.length === battingRows.length &&
    seasonBowlingRows.length === bowlingRows.length;

  /*
   * Matches, not innings — and counted from every role, not two of them.
   *
   * A player who bats and bowls in the same game appears in both row sets, so
   * adding the two innings counts would say somebody played twice as many
   * matches as they did. "33 matches" is the headline figure on a career page,
   * sitting right next to the runs.
   *
   * Taking it from those two sets alone had the opposite failure: a specialist
   * fielder who took two catches and neither batted nor bowled had **played
   * zero matches**, on a page listing the catches they took. Appearances now
   * come from the ball log in any role.
   */
  const matches = appearances.get(playerId) ?? 0;

  return {
    player: {
      id: player.id,
      fullName: player.fullName,
      // How they play, for the line under the name. Nullable: a player can be
      // added to a squad with nothing but a name, and usually is.
      role: player.role ?? null,
      battingStyle: player.battingStyle ?? null,
      bowlingStyle: player.bowlingStyle ?? null,
    },
    matches,
    batting,
    bowling,
    fielding,
    season:
      latestSeason === null || seasonIsWholeCareer
        ? null
        : {
            label: String(latestSeason),
            batting: foldBatting(seasonBattingRows),
            bowling: foldBowling(seasonBowlingRows),
          },
    // Rows arrive newest-first from the query.
    form: battingRows.slice(0, FORM_LENGTH).map((r) => ({
      matchId: r.matchId,
      playedAt: r.playedAt ?? null,
      opponent: r.opponent,
      runs: r.runs,
      balls: r.balls,
      notOut: !r.isOut,
    })),
    milestones: milestonesFor(battingRows, bowlingRows),
  };
}
