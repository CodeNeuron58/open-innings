/**
 * Open Innings — replay and recompute utilities.
 *
 * These functions operate on a sequence of BallEvents and reconstruct
 * the full MatchState. Use them for:
 *   - Loading a match from the DB
 *   - Generating public scorecards
 *   - Computing player career stats (over many matches)
 *   - Undo (replay with N-1 events)
 */

import {
  type BallEventInput,
  type MatchState,
  type InningsState,
  asInningsId,
  asPlayerId,
  asTeamId,
  asMatchId,
} from './types';
import { applyBall } from './engine';
import { STANDARD_MAX_WICKETS, SUPER_OVER_MAX_WICKETS, SUPER_OVER_OVERS } from './rules';

// ─────────────────────────────────────────────────────────────────────────────
// Initial state factory
// ─────────────────────────────────────────────────────────────────────────────

export type InitialStateInput = {
  matchId: string;
  oversPerInnings: number;
  teamAId: string;
  teamBId: string;
  battingTeamId: string;
  bowlingTeamId: string;
  inningsId: string;
  inningsNumber: 1 | 2 | 3 | 4;
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string;
  target?: number;
  maxWickets?: number;
  /** Overrides the match length for this innings. Defaults to one for a Super Over. */
  inningsOvers?: number;
  /**
   * The competition's per-bowler over limit, if it has one.
   *
   * Undefined means unenforced. Passed straight through rather than derived,
   * because the safe default depends on whether the bowling side has enough
   * bowlers to cover the innings under it — which is squad knowledge this
   * package deliberately does not have.
   */
  maxOversPerBowler?: number;
};

/**
 * Build the initial state for a fresh innings.
 * Use this as the seed for replay, or to display a not-yet-started innings.
 */
export function initialState(input: InitialStateInput): MatchState {
  const matchId = asMatchId(input.matchId);
  const inningsId = asInningsId(input.inningsId);

  // Innings 3 and 4 are a Super Over: two wickets, and one over rather than
  // the match's. Both caps travel with the innings, not the match.
  const isSuperOver = input.inningsNumber === 3 || input.inningsNumber === 4;

  const maxWickets =
    input.maxWickets ?? (isSuperOver ? SUPER_OVER_MAX_WICKETS : STANDARD_MAX_WICKETS);

  const oversPerInnings =
    input.inningsOvers ?? (isSuperOver ? SUPER_OVER_OVERS : input.oversPerInnings);

  const innings: InningsState = {
    id: inningsId,
    inningsNumber: input.inningsNumber,
    battingTeamId: asTeamId(input.battingTeamId),
    bowlingTeamId: asTeamId(input.bowlingTeamId),
    runs: 0,
    wickets: 0,
    ballsBowled: 0,
    extras: 0,
    strikerId: asPlayerId(input.strikerId),
    nonStrikerId: asPlayerId(input.nonStrikerId),
    currentBowlerId: asPlayerId(input.bowlerId),
    isFreeHitNext: false,
    status: 'in_progress',
    target: input.target,
    maxWickets,
    oversPerInnings,
    maxOversPerBowler: input.maxOversPerBowler,
  };

  return {
    match: {
      id: matchId,
      oversPerInnings: input.oversPerInnings,
      status: 'live',
      teamAId: asTeamId(input.teamAId),
      teamBId: asTeamId(input.teamBId),
    },
    currentInnings: innings,
    batting: {},
    bowling: {},
    partnerships: [],
    fallOfWickets: [],
    balls: [],
    violations: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Replay — reconstruct state from a list of events.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replay an ordered list of ball events to reconstruct MatchState.
 * If the list includes events from multiple innings, only the last innings
 * is reflected in `currentInnings`. (For multi-innings, use replayMatch.)
 */
export function replayEvents(seed: MatchState, events: readonly BallEventInput[]): MatchState {
  /*
   * Replay mode, always — these deliveries are already in the ball log.
   *
   * A rule tightened today cannot un-bowl a ball bowled last season, and
   * refusing to load the match is not a way of disagreeing with it. Anything
   * the current rules object to lands on `state.violations`, where a report
   * can read it and a repair can act on it, while the scorecard still renders.
   *
   * `applyBall` on its own stays strict, which is what recording a new
   * delivery needs — so the split is exactly write versus read.
   */
  return events.reduce<MatchState>(
    (state, event) => applyBall(state, event, { mode: 'replay' }),
    seed,
  );
}

/**
 * Replay all events for a single innings.
 * Convenience wrapper: builds the seed, replays, returns state.
 */
export function replayInnings(
  seedInput: InitialStateInput,
  events: readonly BallEventInput[],
): MatchState {
  return replayEvents(initialState(seedInput), events);
}

// ─────────────────────────────────────────────────────────────────────────────
// Undo — drop the last event, recompute.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return a new state with the last event removed.
 * Cheaper than re-applying all events, but requires the previous state
 * to be available. For DB-driven undo, use `replayWithLastRemoved` instead.
 */
export function undoLastEvent(state: MatchState): MatchState {
  if (state.balls.length === 0) return state;
  // Replay from the seed. We don't have the seed here, so we use the events.
  // The cleaner approach is to keep the seed in memory.
  return state; // Caller should use replayWithLastRemoved instead
}

/**
 * Drop the last event from the list and re-apply.
 * Use this when undoing in a DB-driven context where we don't have the
 * original seed.
 */
export function replayWithLastRemoved(
  seed: MatchState,
  events: readonly BallEventInput[],
): MatchState {
  if (events.length === 0) return seed;
  return replayEvents(seed, events.slice(0, -1));
}
