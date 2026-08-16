/**
 * A player's career record, transport-free.
 *
 * Everything here is folded from the per-innings rows in `lib/db/stats.ts`.
 * Nothing is stored, so a corrected ball corrects the career.
 */
import 'server-only';
import {
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
  player: { id: string; fullName: string };
  batting: BattingCareer;
  bowling: BowlingCareer;
  fielding: { catches: number; runOuts: number; stumpings: number };
  form: FormEntry[];
  milestones: string[];
};

function foldBatting(rows: BattingInnings[]): BattingCareer {
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

function foldBowling(rows: BowlingInnings[]): BowlingCareer {
  const balls = rows.reduce((n, r) => n + r.balls, 0);
  const runs = rows.reduce((n, r) => n + r.runs, 0);
  const wickets = rows.reduce((n, r) => n + r.wickets, 0);

  // Best figures are most wickets, then fewest runs — 5-20 beats 5-31, and
  // both beat 4-10.
  let bestWickets = 0;
  let bestRuns = 0;
  for (const r of rows) {
    if (
      r.wickets > bestWickets ||
      (r.wickets === bestWickets && r.wickets > 0 && r.runs < bestRuns)
    ) {
      bestWickets = r.wickets;
      bestRuns = r.runs;
    }
  }

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
 * The milestones worth telling someone about.
 *
 * Deliberately few. A profile listing thirty achievements says nothing; three
 * that are actually rare say something. These are the ones a club cricketer
 * would mention in the bar.
 */
function milestonesFor(batting: BattingCareer, bowling: BowlingCareer): string[] {
  const out: string[] = [];

  if (batting.hundreds > 0) {
    out.push(batting.hundreds === 1 ? 'First century' : `${batting.hundreds} centuries`);
  }
  if (batting.fifties > 0) {
    out.push(batting.fifties === 1 ? 'First fifty' : `${batting.fifties} fifties`);
  }
  if (batting.runs >= 1000) out.push(`${Math.floor(batting.runs / 1000) * 1000} career runs`);
  if (bowling.fiveFors > 0) {
    out.push(bowling.fiveFors === 1 ? 'First five-for' : `${bowling.fiveFors} five-fors`);
  }
  if (bowling.wickets >= 50) out.push(`${Math.floor(bowling.wickets / 50) * 50} career wickets`);

  return out;
}

export async function careerFor(playerId: string): Promise<PlayerCareer> {
  const player = await getPlayer(playerId);
  if (!player) throw notFound('Player not found');

  // Independent aggregates — no reason to wait for them in series.
  const [battingRows, bowlingRows, fielding] = await Promise.all([
    battingInningsFor(playerId),
    bowlingInningsFor(playerId),
    fieldingTotalsFor(playerId),
  ]);

  const batting = foldBatting(battingRows);
  const bowling = foldBowling(bowlingRows);

  return {
    player: { id: player.id, fullName: player.fullName },
    batting,
    bowling,
    fielding,
    // Rows arrive newest-first from the query.
    form: battingRows.slice(0, FORM_LENGTH).map((r) => ({
      matchId: r.matchId,
      playedAt: r.playedAt ?? null,
      opponent: r.opponent,
      runs: r.runs,
      balls: r.balls,
      notOut: !r.isOut,
    })),
    milestones: milestonesFor(batting, bowling),
  };
}
