/**
 * Open Innings — scorecard view models.
 *
 * Transforms raw MatchState into shape the React components consume.
 * Components should NEVER need to read MatchState directly — they read
 * ScorecardView. This separation lets us evolve the engine without
 * breaking UI.
 */

import type { MatchState, BatsmanStats, BowlerStats, BallEvent } from './types';
import { formatOvers, currentRunRate, requiredRunRate, maxLegalBallsForOvers } from './helpers';

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

export type BallChip = {
  ballNumber: number; // sequence in innings
  display: string; // "1", "4", "6", "W", "wd", "nb", "W1", "2nb"
  type: 'run' | 'boundary' | 'six' | 'wicket' | 'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'dot';
  totalRuns: number;
};

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
  const rrr = inn.target
    ? requiredRunRate(
        inn.target,
        inn.runs,
        inn.ballsBowled,
        maxLegalBallsForOvers(state.match.oversPerInnings),
      )
    : undefined;

  return {
    runs: inn.runs,
    wickets: inn.wickets,
    overs: formatOvers(inn.ballsBowled),
    ballsBowled: inn.ballsBowled,
    runRate: round2(currentRunRate(inn.runs, inn.ballsBowled)),
    requiredRunRate: rrr !== undefined && isFinite(rrr) ? round2(rrr) : undefined,
    target: inn.target,
    extras: inn.extras,

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
  const isWicket = !!ball.wicketType;

  let type: BallChip['type'] = 'dot';
  let display = '';

  if (isWicket) {
    type = 'wicket';
    display = 'W';
  } else if (ball.eventType === 'wide') {
    type = 'wide';
    display = ball.totalRuns > 1 ? `wd${ball.totalRuns - 1}` : 'wd';
  } else if (ball.eventType === 'no_ball') {
    type = 'no_ball';
    display = ball.runsOffBat > 0 ? `${ball.runsOffBat}nb` : 'nb';
  } else if (ball.eventType === 'bye') {
    type = 'bye';
    display = `${ball.totalRuns}b`;
  } else if (ball.eventType === 'leg_bye') {
    type = 'leg_bye';
    display = `${ball.totalRuns}lb`;
  } else if (ball.runsOffBat === 6) {
    type = 'six';
    display = '6';
  } else if (ball.runsOffBat === 4) {
    type = 'boundary';
    display = '4';
  } else if (ball.runsOffBat > 0) {
    type = 'run';
    display = String(ball.runsOffBat);
  } else {
    type = 'dot';
    display = '0';
  }

  return {
    ballNumber: ball.ballNumber,
    display,
    type,
    totalRuns: ball.totalRuns,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
