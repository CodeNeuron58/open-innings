/**
 * A scorecard has to add up.
 *
 * Whatever convention a scoring system picks for a given kind of run, one
 * identity has to hold or the card is not a scorecard:
 *
 *     innings runs === sum(batter runs) + extras
 *
 * Every printed scorecard in cricket balances this way, and it is the check a
 * scorer does by eye before signing the book. These tests assert the identity
 * directly rather than asserting any particular column, so they stay true
 * regardless of which column a convention assigns a run to.
 */
import { describe, it, expect } from 'vitest';
import { applyBall } from '../engine';
import { buildScorecard } from '../scorecard';
import { initialState } from '../compute';
import { asInningsId, type MatchState, type BallEventInput } from '../types';

const seed = (): MatchState =>
  initialState({
    matchId: 'm1',
    oversPerInnings: 20,
    teamAId: 'A',
    teamBId: 'B',
    battingTeamId: 'A',
    bowlingTeamId: 'B',
    inningsId: 'i1',
    inningsNumber: 1,
    strikerId: 'p1',
    nonStrikerId: 'p2',
    bowlerId: 'p3',
  });

const bowl = (s: MatchState, over: Partial<BallEventInput>): MatchState =>
  applyBall(s, {
    inningsId: asInningsId('i1'),
    eventType: 'dot',
    runsOffBat: 0,
    extraRuns: 0,
    batsmanId: s.currentInnings.strikerId,
    nonStrikerId: s.currentInnings.nonStrikerId,
    bowlerId: s.currentInnings.currentBowlerId,
    ...over,
  });

/** innings runs, and what the two scorecard columns actually account for. */
function books(s: MatchState) {
  const batted = Object.values(s.batting).reduce((n, b) => n + b.runs, 0);
  return {
    total: s.currentInnings.runs,
    accounted: batted + s.currentInnings.extras,
    batted,
    extras: s.currentInnings.extras,
  };
}

describe('the scorecard balances', () => {
  it('balances on ordinary deliveries', () => {
    let s = seed();
    s = bowl(s, { eventType: '4', runsOffBat: 4 });
    s = bowl(s, { eventType: 'wide', extraRuns: 1 });
    s = bowl(s, { eventType: 'leg_bye', extraRuns: 2 });
    s = bowl(s, { eventType: '1', runsOffBat: 1 });
    const b = books(s);
    expect(b.accounted).toBe(b.total);
  });

  it('balances when runs come from an overthrow', () => {
    // Stokes, 2019 World Cup final: struck for 2, the throw went to the
    // boundary, 6 runs went on the board.
    let s = seed();
    s = bowl(s, { eventType: '2', runsOffBat: 2, overthrowRuns: 4 });

    const b = books(s);
    expect(b.total).toBe(6); // the board is right
    expect(b.accounted).toBe(b.total); // the columns are not
  });

  it('balances when an overthrow follows a bye', () => {
    let s = seed();
    s = bowl(s, { eventType: 'bye', extraRuns: 1, overthrowRuns: 4 });
    const b = books(s);
    expect(b.accounted).toBe(b.total);
  });
});

describe('the bowler and the batters tell the same story', () => {
  it('runs charged to the bowler are runs someone was credited with', () => {
    // Nothing is exempt here: a struck ball plus overthrows is charged to the
    // bowler in full, so the same runs must appear against a batter.
    let s = seed();
    s = bowl(s, { eventType: '2', runsOffBat: 2, overthrowRuns: 4 });

    expect(s.bowling['p3']?.runs).toBe(6);
    expect(s.batting['p1']?.runs).toBe(6);
  });
});

describe('the extras line adds up', () => {
  it('breaks the extras total into parts that sum back to it', () => {
    let s = seed();
    s = bowl(s, { eventType: 'wide', extraRuns: 1 });
    s = bowl(s, { eventType: 'bye', extraRuns: 2 });
    s = bowl(s, { eventType: 'leg_bye', extraRuns: 1 });
    s = bowl(s, { eventType: 'no_ball', extraRuns: 1, runsOffBat: 4 });
    s = bowl(s, { eventType: 'penalty', extraRuns: 5 });

    const { extrasBreakdown: e } = buildScorecard(s, (id) => id);
    const parts = e.wides + e.noBalls + e.byes + e.legByes + e.penalty;

    expect(e.total).toBe(s.currentInnings.extras);
    expect(parts).toBe(e.total);
  });
});
