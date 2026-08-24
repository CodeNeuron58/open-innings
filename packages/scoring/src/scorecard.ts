/**
 * Open Innings — scorecard view models.
 *
 * Transforms raw MatchState into shape the React components consume.
 * Components should NEVER need to read MatchState directly — they read
 * ScorecardView. This separation lets us evolve the engine without
 * breaking UI.
 */

import type { MatchState, BatsmanStats, BowlerStats, BallEvent } from './types';
import {
  formatOvers,
  currentRunRate,
  requiredRunRate,
  maxLegalBallsForOvers,
  extrasFrom,
} from './helpers';

// ─────────────────────────────────────────────────────────────────────────────
// ScorecardView — what the UI consumes.
// ─────────────────────────────────────────────────────────────────────────────

export type ScorecardView = {
  // Innings summary
  runs: number;
  wickets: number;
  overs: string; // "12.3"
  ballsBowled: number;
  runRate: number;
  requiredRunRate?: number;
  target?: number;
  extras: number;
  extrasBreakdown: ExtrasBreakdown;

  // Player stats tables
  batting: BattingRow[];
  bowling: BowlingRow[];

  // Current state
  striker: CurrentBatsmanView | null;
  nonStriker: CurrentBatsmanView | null;
  currentBowler: CurrentBowlerView | null;
  isFreeHitNext: boolean;

  // History
  fallOfWickets: FallOfWicketView[];
  partnerships: PartnershipView[];
  recentBalls: BallChip[];

  // Innings status
  inningsStatus: 'not_started' | 'in_progress' | 'completed';
};

export type BattingRow = {
  playerId: string;
  playerName: string; // resolved from players table in caller
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: string; // formatted
  isOut: boolean;
  dismissalText?: string; // "b Khan", "c Rohit b Bumrah", "run out"
  isRetiredHurt?: boolean;
};

export type BowlingRow = {
  playerId: string;
  playerName: string;
  overs: string; // "4.2"
  maidens: number;
  runs: number;
  wickets: number;
  economy: string; // formatted
  noBalls: number;
  wides: number;
};

export type CurrentBatsmanView = {
  playerId: string;
  playerName: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: string;
};

export type CurrentBowlerView = {
  playerId: string;
  playerName: string;
  overs: string;
  runs: number;
  wickets: number;
  economy: string;
};

export type ExtrasBreakdown = {
  total: number;
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  penalty: number;
};

export type FallOfWicketView = {
  wicketNumber: number;
  runsAtFall: number;
  oversAtFall: string;
  batsmanOutName: string;
};

export type PartnershipView = {
  batsman1Name: string;
  batsman2Name: string;
  runs: number;
  balls: number;
  isActive: boolean;
};

/**
 * What kind of thing a delivery was, for anything that colours or groups it.
 *
 * Semantic rather than visual: the scoring package has no opinion on what a
 * six should look like, only that it was one. Each surface maps these to its
 * own palette.
 */
export type BallChipKind =
  | 'dot'
  | 'run'
  | 'boundary'
  | 'six'
  | 'wicket'
  | 'wide'
  | 'no_ball'
  | 'bye'
  | 'leg_bye'
  | 'penalty';

export type BallDescription = {
  /** What the scorebook writes: "4", "wd2", "2lb", "W1", "+5P", "•". */
  label: string;
  kind: BallChipKind;
};

export type BallChip = BallDescription & {
  ballNumber: number; // sequence in innings
  totalRuns: number;
};

/** The fields a delivery has to carry to be described. */
export type DescribableBall = {
  eventType: string;
  runsOffBat: number;
  totalRuns: number;
  wicketType?: string | null;
};

/**
 * The one place a delivery is turned into the mark a scorer would write.
 *
 * There were three of these — this function, `ballChipParts` on the web and
 * `describe` in the mobile chip — and they disagreed. A three-run wide read
 * `wd2` in two of them and `3wd` in the third; a bye for two was `2b` here and
 * `b2` on the phone; and a ball struck for two with four overthrown showed 6
 * on the web scorecard and 2 in the app, which is the same delivery reported
 * as two different scores on two screens of the same match.
 *
 * Both apps now call this. The notation is the majority of what the three
 * already did, so the web page is the only surface whose marks change.
 */
export function ballMark(ball: DescribableBall): BallDescription {
  // A wicket outranks whatever the ball was otherwise worth — a run-out for
  // one is "W1", not "1".
  if (ball.wicketType) {
    return { label: ball.totalRuns > 0 ? `W${ball.totalRuns}` : 'W', kind: 'wicket' };
  }

  switch (ball.eventType) {
    // Wides and no-balls carry a one-run penalty, and the figure a scorer
    // writes is what was scored *beyond* it: `wd2` is a wide plus two run.
    case 'wide':
      return { label: ball.totalRuns > 1 ? `wd${ball.totalRuns - 1}` : 'wd', kind: 'wide' };
    case 'no_ball':
      return { label: ball.totalRuns > 1 ? `nb${ball.totalRuns - 1}` : 'nb', kind: 'no_ball' };
    // Byes carry no penalty, so every run on the board was run — the figure
    // leads, as it does in a scorebook.
    case 'bye':
      return { label: `${ball.totalRuns}b`, kind: 'bye' };
    case 'leg_bye':
      return { label: `${ball.totalRuns}lb`, kind: 'leg_bye' };
    case 'penalty':
      return { label: `+${ball.totalRuns}P`, kind: 'penalty' };
  }

  // A boundary is a stroke, so it is read off the bat and not the total: two
  // run plus four overthrown is six runs and no boundary.
  if (ball.runsOffBat === 6) return { label: '6', kind: 'six' };
  if (ball.runsOffBat === 4) return { label: '4', kind: 'boundary' };

  // Everything else is worth what the side got, overthrows included.
  if (ball.totalRuns === 0) return { label: '•', kind: 'dot' };
  return { label: String(ball.totalRuns), kind: 'run' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Player name resolver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Caller passes a function to resolve player IDs → display names.
 * We don't import the DB schema here to keep this file pure.
 */
export type NameResolver = (playerId: string) => string;

const fallbackName: NameResolver = (id) => id.slice(0, 6);

// ─────────────────────────────────────────────────────────────────────────────
// View builders
// ─────────────────────────────────────────────────────────────────────────────

export function buildScorecard(
  state: MatchState,
  resolveName: NameResolver = fallbackName,
): ScorecardView {
  const inn = state.currentInnings;
  // The innings' own length where it has one — a Super Over chase needs a rate
  // over its single over, not over the match's twenty.
  const inningsOvers = inn.oversPerInnings ?? state.match.oversPerInnings;
  const rrr = inn.target
    ? requiredRunRate(inn.target, inn.runs, inn.ballsBowled, maxLegalBallsForOvers(inningsOvers))
    : undefined;

  const extrasBreakdown: ExtrasBreakdown = {
    total: inn.extras,
    wides: 0,
    noBalls: 0,
    byes: 0,
    legByes: 0,
    penalty: 0,
  };
  // `extrasFrom`, not `totalRuns` — a no-ball struck for four is five runs and
  // one extra. Counting the total here printed an extras line whose parts came
  // to more than the total above them.
  for (const b of state.balls) {
    const e = extrasFrom(b);
    if (b.eventType === 'wide') extrasBreakdown.wides += e;
    else if (b.eventType === 'no_ball') extrasBreakdown.noBalls += e;
    else if (b.eventType === 'bye') extrasBreakdown.byes += e;
    else if (b.eventType === 'leg_bye') extrasBreakdown.legByes += e;
    else if (b.eventType === 'penalty') extrasBreakdown.penalty += e;
  }

  return {
    runs: inn.runs,
    wickets: inn.wickets,
    overs: formatOvers(inn.ballsBowled),
    ballsBowled: inn.ballsBowled,
    runRate: round2(currentRunRate(inn.runs, inn.ballsBowled)),
    requiredRunRate: rrr !== undefined && isFinite(rrr) ? round2(rrr) : undefined,
    target: inn.target,
    extras: inn.extras,
    extrasBreakdown,

    batting: Object.values(state.batting).map((b) => buildBattingRow(b, resolveName)),
    bowling: Object.values(state.bowling).map((b) => buildBowlingRow(b, resolveName)),

    striker: getCurrentBatsman(state, resolveName, inn.strikerId),
    nonStriker: getCurrentBatsman(state, resolveName, inn.nonStrikerId),
    currentBowler: getCurrentBowler(state, resolveName, inn.currentBowlerId),

    isFreeHitNext: inn.isFreeHitNext,

    fallOfWickets: state.fallOfWickets.map((f) => ({
      wicketNumber: f.wicketNumber,
      runsAtFall: f.runs,
      oversAtFall: formatOvers(f.ballsBowled),
      batsmanOutName: resolveName(f.batsmanOutId),
    })),
    partnerships: state.partnerships.map((p) => ({
      batsman1Name: resolveName(p.batsman1Id),
      batsman2Name: resolveName(p.batsman2Id),
      runs: p.runs,
      balls: p.balls,
      isActive: p.isActive,
    })),
    recentBalls: state.balls.slice(-12).map(buildBallChip),

    inningsStatus: inn.status,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Row builders
// ─────────────────────────────────────────────────────────────────────────────

function buildBattingRow(b: BatsmanStats, resolve: NameResolver): BattingRow {
  const sr = b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(2) : '—';
  return {
    playerId: b.playerId as unknown as string,
    playerName: resolve(b.playerId as unknown as string),
    runs: b.runs,
    balls: b.balls,
    fours: b.fours,
    sixes: b.sixes,
    strikeRate: sr,
    isOut: b.isOut,
    isRetiredHurt: b.isRetiredHurt,
    dismissalText: formatDismissal(b, resolve),
  };
}

function formatDismissal(b: BatsmanStats, resolve: NameResolver): string | undefined {
  if (b.isRetiredHurt) return 'retired hurt';
  if (!b.isOut) return 'not out';
  if (!b.dismissalType) return undefined;

  const bowler = b.dismissedByPlayerId
    ? resolve(b.dismissedByPlayerId as unknown as string)
    : undefined;
  const fielder = b.fielderId ? resolve(b.fielderId as unknown as string) : undefined;

  switch (b.dismissalType) {
    case 'bowled':
      return `b ${bowler ?? '?'}`;
    case 'caught':
    case 'caught_behind':
      return `c ${fielder ?? '?'} b ${bowler ?? '?'}`;
    case 'lbw':
      return `lbw b ${bowler ?? '?'}`;
    case 'run_out':
      return `run out${fielder ? ` (${fielder})` : ''}`;
    case 'stumped':
      return `st ${fielder ?? '?'} b ${bowler ?? '?'}`;
    case 'hit_wicket':
      return `hit wicket b ${bowler ?? '?'}`;
    case 'handled_ball':
    case 'obstructing_field':
    case 'timed_out':
    case 'retired_out':
    case 'double_hit':
    case 'hit_the_ball_twice':
      return b.dismissalType.replace(/_/g, ' ');
    default:
      return undefined;
  }
}

function buildBowlingRow(b: BowlerStats, resolve: NameResolver): BowlingRow {
  const eco = b.balls > 0 ? ((b.runs / b.balls) * 6).toFixed(2) : '—';
  return {
    playerId: b.playerId as unknown as string,
    playerName: resolve(b.playerId as unknown as string),
    overs: formatOvers(b.balls),
    maidens: b.maidens,
    runs: b.runs,
    wickets: b.wickets,
    economy: eco,
    noBalls: b.noBalls,
    wides: b.wides,
  };
}

function getCurrentBatsman(
  state: MatchState,
  resolve: NameResolver,
  playerId: string,
): CurrentBatsmanView | null {
  const stats = state.batting[playerId];
  if (!stats) return null;
  const sr = stats.balls > 0 ? ((stats.runs / stats.balls) * 100).toFixed(2) : '—';
  return {
    playerId,
    playerName: resolve(playerId),
    runs: stats.runs,
    balls: stats.balls,
    fours: stats.fours,
    sixes: stats.sixes,
    strikeRate: sr,
  };
}

function getCurrentBowler(
  state: MatchState,
  resolve: NameResolver,
  playerId: string,
): CurrentBowlerView | null {
  const stats = state.bowling[playerId];
  if (!stats) return null;
  const eco = stats.balls > 0 ? ((stats.runs / stats.balls) * 6).toFixed(2) : '—';
  return {
    playerId,
    playerName: resolve(playerId),
    overs: formatOvers(stats.balls),
    runs: stats.runs,
    wickets: stats.wickets,
    economy: eco,
  };
}

function buildBallChip(ball: BallEvent): BallChip {
  return { ...ballMark(ball), ballNumber: ball.ballNumber, totalRuns: ball.totalRuns };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
