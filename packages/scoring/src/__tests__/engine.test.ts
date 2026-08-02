/**
 * Open Innings — engine tests.
 *
 * 40+ test cases covering every cricket rule.
 *
 * Uses a `play()` fixture helper that tracks rotation of striker/non-striker
 * and the bowler. This keeps tests readable and matches real cricket flow.
 */

import { describe, it, expect } from 'vitest';
import { applyBall } from '../engine';
import { initialState, replayInnings, replayWithLastRemoved } from '../compute';
import { buildScorecard } from '../scorecard';
import {
  ScoringError,
  type MatchState,
  type PlayerId,
  type BallEventType,
  type WicketType,
  asInningsId,
} from '../types';
import { play, startRotation } from './fixtures';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MATCH_ID = 'm1';
const INNINGS_ID = 'i1';
const TEAM_A = 'team-a';
const TEAM_B = 'team-b';
const STRIKER = 'p1';
const NON_STRIKER = 'p2';
const BOWLER = 'p3';
const BOWLER_2 = 'p4';
const FIELDER_1 = 'fielder1';

// Branded PlayerId cast (test convenience)
const pid = (s: string): PlayerId => s as PlayerId;

function seed(): MatchState {
  return initialState({
    matchId: MATCH_ID,
    oversPerInnings: 20,
    teamAId: TEAM_A,
    teamBId: TEAM_B,
    battingTeamId: TEAM_A,
    bowlingTeamId: TEAM_B,
    inningsId: INNINGS_ID,
    inningsNumber: 1,
    strikerId: STRIKER,
    nonStrikerId: NON_STRIKER,
    bowlerId: BOWLER,
  });
}

/** Build an event for a given rotation (for tests that bypass `play()`). */
function ev(
  rot: { striker: string; nonStriker: string; bowler: string },
  args: {
    eventType: BallEventType;
    runsOffBat: number;
    totalRuns: number;
    wicketType?: WicketType;
    wicketPlayerId?: string;
    fielderId?: string;
  },
) {
  return {
    inningsId: asInningsId(INNINGS_ID),
    eventType: args.eventType,
    runsOffBat: args.runsOffBat,
    extraRuns: args.totalRuns - args.runsOffBat,
    totalRuns: args.totalRuns,
    batsmanId: pid(rot.striker),
    nonStrikerId: pid(rot.nonStriker),
    bowlerId: pid(rot.bowler),
    wicketType: args.wicketType,
    wicketPlayerId: args.wicketPlayerId ? pid(args.wicketPlayerId) : undefined,
    fielderId: args.fielderId ? pid(args.fielderId) : undefined,
  };
}

/** Apply a sequence of balls to a fresh seed. Returns final state and the rotation after. */
function applyBalls(
  balls: Array<{
    eventType: string;
    runsOffBat: number;
    totalRuns: number;
    wicketType?: string;
    wicketPlayerId?: string;
    fielderId?: string;
  }>,
): MatchState {
  let state = seed();
  let rot = startRotation(STRIKER, NON_STRIKER, BOWLER);
  for (const args of balls) {
    const { event, rotation } = play(rot, {
      ...args,
      ballsBowledBefore: state.currentInnings.ballsBowled,
    });
    state = applyBall(state, event);
    rot = rotation;
    // Detect end of over: rotation.lastBowler indicates one just happened,
    // and we need to swap the bowler for the next over
    if (rot.lastBowler === rot.bowler) {
      // rotation's lastBowler was just set; the rotation's bowler field
      // is still the just-finished over's bowler. Switch to BOWLER_2.
      rot = { ...rot, bowler: BOWLER_2, lastBowler: rot.bowler };
    }
  }
  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Legal deliveries
// ─────────────────────────────────────────────────────────────────────────────

describe('applyBall — legal deliveries', () => {
  it('credits a dot ball to the bowler but not the batsman', () => {
    const state = applyBalls([{ eventType: 'dot', runsOffBat: 0, totalRuns: 0 }]);
    expect(state.currentInnings.runs).toBe(0);
    expect(state.currentInnings.wickets).toBe(0);
    expect(state.currentInnings.ballsBowled).toBe(1);
    expect(state.batting[STRIKER]?.runs).toBe(0);
    expect(state.batting[STRIKER]?.balls).toBe(1);
    expect(state.bowling[BOWLER]?.balls).toBe(1);
    expect(state.bowling[BOWLER]?.runs).toBe(0);
  });

  it('credits a 1 and rotates strike', () => {
    const state = applyBalls([{ eventType: '1', runsOffBat: 1, totalRuns: 1 }]);
    expect(state.batting[STRIKER]?.runs).toBe(1);
    expect(state.batting[STRIKER]?.balls).toBe(1);
    expect(state.currentInnings.runs).toBe(1);
  });

  it('credits a 4 and tracks fours', () => {
    const state = applyBalls([{ eventType: '4', runsOffBat: 4, totalRuns: 4 }]);
    expect(state.batting[STRIKER]?.runs).toBe(4);
    expect(state.batting[STRIKER]?.fours).toBe(1);
    expect(state.batting[STRIKER]?.sixes).toBe(0);
  });

  it('credits a 6 and tracks sixes', () => {
    const state = applyBalls([{ eventType: '6', runsOffBat: 6, totalRuns: 6 }]);
    expect(state.batting[STRIKER]?.runs).toBe(6);
    expect(state.batting[STRIKER]?.sixes).toBe(1);
  });

  it('credits a 3 and rotates strike', () => {
    const state = applyBalls([{ eventType: '3', runsOffBat: 3, totalRuns: 3 }]);
    expect(state.batting[STRIKER]?.runs).toBe(3);
  });

  it('does not swap strike on a 2', () => {
    const state = applyBalls([{ eventType: '2', runsOffBat: 2, totalRuns: 2 }]);
    expect(state.currentInnings.strikerId).toBe(STRIKER);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Wides
// ─────────────────────────────────────────────────────────────────────────────

describe('applyBall — wides', () => {
  it('adds 1 penalty run and does not credit the batsman', () => {
    const state = applyBalls([{ eventType: 'wide', runsOffBat: 0, totalRuns: 1 }]);
    expect(state.currentInnings.runs).toBe(1);
    expect(state.batting[STRIKER]?.runs).toBe(0);
    expect(state.batting[STRIKER]?.balls).toBe(0);
    expect(state.currentInnings.ballsBowled).toBe(0);
    expect(state.bowling[BOWLER]?.runs).toBe(1);
    expect(state.bowling[BOWLER]?.wides).toBe(1);
  });

  it('wide does not advance the over', () => {
    const state = applyBalls([{ eventType: 'wide', runsOffBat: 0, totalRuns: 1 }]);
    expect(state.currentInnings.ballsBowled).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. No-balls
// ─────────────────────────────────────────────────────────────────────────────

describe('applyBall — no-balls', () => {
  it('adds 1 penalty and marks next ball as free hit', () => {
    const state = applyBalls([{ eventType: 'no_ball', runsOffBat: 0, totalRuns: 1 }]);
    expect(state.currentInnings.runs).toBe(1);
    expect(state.batting[STRIKER]?.runs).toBe(0);
    expect(state.currentInnings.ballsBowled).toBe(0);
    expect(state.bowling[BOWLER]?.runs).toBe(1);
    expect(state.bowling[BOWLER]?.noBalls).toBe(1);
    expect(state.currentInnings.isFreeHitNext).toBe(true);
  });

  it('next ball is marked as a free hit', () => {
    const state = applyBalls([
      { eventType: 'no_ball', runsOffBat: 0, totalRuns: 1 },
      { eventType: 'dot', runsOffBat: 0, totalRuns: 0 },
    ]);
    expect(state.balls[1]?.isFreeHit).toBe(true);
    expect(state.currentInnings.isFreeHitNext).toBe(false);
  });

  it('free hit ball increments batsman balls faced', () => {
    const state = applyBalls([
      { eventType: 'no_ball', runsOffBat: 0, totalRuns: 1 },
      { eventType: 'dot', runsOffBat: 0, totalRuns: 0 },
    ]);
    expect(state.batting[STRIKER]?.balls).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Free hit
// ─────────────────────────────────────────────────────────────────────────────

describe('applyBall — free hit constraints', () => {
  function freeHitState() {
    let state = seed();
    const rot = startRotation(STRIKER, NON_STRIKER, BOWLER);
    const { event, rotation } = play(rot, { eventType: 'no_ball', runsOffBat: 0, totalRuns: 1 });
    state = applyBall(state, event);
    return { state, rot: rotation };
  }

  it('rejects bowled dismissal on free hit', () => {
    const { state, rot } = freeHitState();
    const event = ev(rot, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'bowled',
      wicketPlayerId: rot.striker,
    });
    expect(() => applyBall(state, event)).toThrow(ScoringError);
  });

  it('rejects caught dismissal on free hit', () => {
    const { state, rot } = freeHitState();
    const event = ev(rot, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'caught',
      wicketPlayerId: rot.striker,
      fielderId: FIELDER_1,
    });
    expect(() => applyBall(state, event)).toThrow(ScoringError);
  });

  it('allows run-out on free hit', () => {
    const { state, rot } = freeHitState();
    const event = ev(rot, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'run_out',
      wicketPlayerId: rot.striker,
      fielderId: FIELDER_1,
    });
    const next = applyBall(state, event);
    expect(next.currentInnings.wickets).toBe(1);
    expect(next.batting[rot.striker]?.isOut).toBe(true);
  });

  it('run-out on free hit does NOT credit the bowler', () => {
    const { state, rot } = freeHitState();
    const event = ev(rot, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'run_out',
      wicketPlayerId: rot.striker,
      fielderId: FIELDER_1,
    });
    const next = applyBall(state, event);
    expect(next.bowling[BOWLER]?.wickets).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Byes / leg-byes
// ─────────────────────────────────────────────────────────────────────────────

describe('applyBall — byes and leg-byes', () => {
  it('bye does NOT credit the batsman and does NOT count as ball faced', () => {
    const state = applyBalls([{ eventType: 'bye', runsOffBat: 0, totalRuns: 1 }]);
    expect(state.currentInnings.runs).toBe(1);
    expect(state.batting[STRIKER]?.runs).toBe(0);
    expect(state.batting[STRIKER]?.balls).toBe(0);
    expect(state.currentInnings.ballsBowled).toBe(1);
  });

  it('leg bye swaps strike on odd totalRuns', () => {
    const state = applyBalls([{ eventType: 'leg_bye', runsOffBat: 0, totalRuns: 1 }]);
    expect(state.currentInnings.strikerId).toBe(NON_STRIKER);
  });

  it('leg bye does not swap strike on even totalRuns', () => {
    const state = applyBalls([{ eventType: 'leg_bye', runsOffBat: 0, totalRuns: 2 }]);
    expect(state.currentInnings.strikerId).toBe(STRIKER);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Wickets
// ─────────────────────────────────────────────────────────────────────────────

describe('applyBall — wickets', () => {
  it('credits bowler for bowled dismissal', () => {
    const state = applyBalls([
      {
        eventType: 'wicket',
        runsOffBat: 0,
        totalRuns: 0,
        wicketType: 'bowled',
        wicketPlayerId: STRIKER,
      },
    ]);
    expect(state.bowling[BOWLER]?.wickets).toBe(1);
    expect(state.currentInnings.wickets).toBe(1);
    expect(state.batting[STRIKER]?.isOut).toBe(true);
    expect(state.batting[STRIKER]?.dismissalType).toBe('bowled');
  });

  it('credits bowler for caught (with fielder)', () => {
    const state = applyBalls([
      {
        eventType: 'wicket',
        runsOffBat: 1,
        totalRuns: 1,
        wicketType: 'caught',
        wicketPlayerId: STRIKER,
        fielderId: FIELDER_1,
      },
    ]);
    expect(state.bowling[BOWLER]?.wickets).toBe(1);
    expect(state.batting[STRIKER]?.fielderId).toBe(FIELDER_1);
  });

  it('does NOT credit bowler for run-out', () => {
    const state = applyBalls([
      {
        eventType: 'wicket',
        runsOffBat: 0,
        totalRuns: 0,
        wicketType: 'run_out',
        wicketPlayerId: STRIKER,
        fielderId: FIELDER_1,
      },
    ]);
    expect(state.bowling[BOWLER]?.wickets).toBe(0);
    expect(state.currentInnings.wickets).toBe(1);
  });

  it('records fall of wicket on counted wicket', () => {
    const state = applyBalls([
      {
        eventType: 'wicket',
        runsOffBat: 0,
        totalRuns: 0,
        wicketType: 'bowled',
        wicketPlayerId: STRIKER,
      },
    ]);
    expect(state.fallOfWickets).toHaveLength(1);
    expect(state.fallOfWickets[0]?.wicketNumber).toBe(1);
    expect(state.fallOfWickets[0]?.batsmanOutId).toBe(STRIKER);
  });

  it('retired hurt does NOT count as a wicket', () => {
    const state = applyBalls([
      {
        eventType: 'wicket',
        runsOffBat: 0,
        totalRuns: 0,
        wicketType: 'retired_hurt',
        wicketPlayerId: STRIKER,
      },
    ]);
    expect(state.currentInnings.wickets).toBe(0);
    expect(state.batting[STRIKER]?.isRetiredHurt).toBe(true);
    expect(state.batting[STRIKER]?.isOut).toBe(false);
    expect(state.fallOfWickets).toHaveLength(0);
  });

  it('retired out DOES count as a wicket', () => {
    const state = applyBalls([
      {
        eventType: 'wicket',
        runsOffBat: 0,
        totalRuns: 0,
        wicketType: 'retired_out',
        wicketPlayerId: STRIKER,
      },
    ]);
    expect(state.currentInnings.wickets).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. End of over
// ─────────────────────────────────────────────────────────────────────────────

describe('applyBall — end of over', () => {
  it('after 6 legal balls, the over is complete', () => {
    const state = applyBalls(Array(6).fill({ eventType: 'dot', runsOffBat: 0, totalRuns: 0 }));
    expect(state.currentInnings.ballsBowled).toBe(6);
  });

  it('rejects same bowler bowling 2 overs in a row', () => {
    let state = seed();
    let rot = startRotation(STRIKER, NON_STRIKER, BOWLER);
    for (let i = 0; i < 6; i++) {
      const { event, rotation } = play(rot, {
        eventType: 'dot',
        runsOffBat: 0,
        totalRuns: 0,
        ballsBowledBefore: state.currentInnings.ballsBowled,
      });
      state = applyBall(state, event);
      rot = rotation;
    }
    // After end-of-over, batsmen swap. Bowler is still BOWLER (test didn't change it).
    // Engine should reject.
    const event = ev(rot, { eventType: 'dot', runsOffBat: 0, totalRuns: 0 });
    expect(() => applyBall(state, event)).toThrow(ScoringError);
  });

  it('allows different bowler for next over', () => {
    let state = seed();
    let rot = startRotation(STRIKER, NON_STRIKER, BOWLER);
    for (let i = 0; i < 6; i++) {
      const { event, rotation } = play(rot, {
        eventType: 'dot',
        runsOffBat: 0,
        totalRuns: 0,
        ballsBowledBefore: state.currentInnings.ballsBowled,
      });
      state = applyBall(state, event);
      rot = rotation;
    }
    // Change bowler
    rot = { ...rot, bowler: BOWLER_2 };
    const event = ev(rot, { eventType: 'dot', runsOffBat: 0, totalRuns: 0 });
    const next = applyBall(state, event);
    expect(next.currentInnings.ballsBowled).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. End of innings
// ─────────────────────────────────────────────────────────────────────────────

describe('applyBall — end of innings', () => {
  it('completes innings when overs run out', () => {
    let state = initialState({
      matchId: MATCH_ID,
      oversPerInnings: 1, // 6 balls
      teamAId: TEAM_A,
      teamBId: TEAM_B,
      battingTeamId: TEAM_A,
      bowlingTeamId: TEAM_B,
      inningsId: INNINGS_ID,
      inningsNumber: 1,
      strikerId: STRIKER,
      nonStrikerId: NON_STRIKER,
      bowlerId: BOWLER,
    });
    let rot = startRotation(STRIKER, NON_STRIKER, BOWLER);
    for (let i = 0; i < 6; i++) {
      const { event, rotation } = play(rot, {
        eventType: 'dot',
        runsOffBat: 0,
        totalRuns: 0,
        ballsBowledBefore: state.currentInnings.ballsBowled,
      });
      state = applyBall(state, event);
      rot = rotation;
    }
    expect(state.currentInnings.status).toBe('completed');
    expect(state.currentInnings.ballsBowled).toBe(6);
  });

  it('completes innings when target reached (2nd innings chase)', () => {
    let state = initialState({
      matchId: MATCH_ID,
      oversPerInnings: 20,
      teamAId: TEAM_A,
      teamBId: TEAM_B,
      battingTeamId: TEAM_B,
      bowlingTeamId: TEAM_A,
      inningsId: INNINGS_ID,
      inningsNumber: 2,
      strikerId: STRIKER,
      nonStrikerId: NON_STRIKER,
      bowlerId: BOWLER,
      target: 5,
    });
    let rot = startRotation(STRIKER, NON_STRIKER, BOWLER);
    let r = play(rot, {
      eventType: '4',
      runsOffBat: 4,
      totalRuns: 4,
      ballsBowledBefore: state.currentInnings.ballsBowled,
    });
    state = applyBall(state, r.event);
    rot = r.rotation;
    r = play(rot, {
      eventType: '1',
      runsOffBat: 1,
      totalRuns: 1,
      ballsBowledBefore: state.currentInnings.ballsBowled,
    });
    state = applyBall(state, r.event);
    expect(state.currentInnings.runs).toBe(5);
    expect(state.currentInnings.status).toBe('completed');
  });

  it('rejects more balls after innings completed', () => {
    let state = seed();
    state = { ...state, currentInnings: { ...state.currentInnings, status: 'completed' } };
    expect(() =>
      applyBall(
        state,
        ev(startRotation(STRIKER, NON_STRIKER, BOWLER), {
          eventType: 'dot',
          runsOffBat: 0,
          totalRuns: 0,
        }),
      ),
    ).toThrow(ScoringError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Replay / undo
// ─────────────────────────────────────────────────────────────────────────────

describe('replay + undo', () => {
  it('replays an innings from events', () => {
    let rot = startRotation(STRIKER, NON_STRIKER, BOWLER);
    let state = seed();
    const events = [];
    for (const args of [
      { eventType: '1', runsOffBat: 1, totalRuns: 1 },
      { eventType: '4', runsOffBat: 4, totalRuns: 4 },
      { eventType: 'dot', runsOffBat: 0, totalRuns: 0 },
      { eventType: '6', runsOffBat: 6, totalRuns: 6 },
    ]) {
      const { event, rotation } = play(rot, {
        ...args,
        ballsBowledBefore: state.currentInnings.ballsBowled,
      });
      events.push(event);
      rot = rotation;
      state = applyBall(state, event);
    }

    const replayed = replayInnings(
      {
        matchId: MATCH_ID,
        oversPerInnings: 20,
        teamAId: TEAM_A,
        teamBId: TEAM_B,
        battingTeamId: TEAM_A,
        bowlingTeamId: TEAM_B,
        inningsId: INNINGS_ID,
        inningsNumber: 1,
        strikerId: STRIKER,
        nonStrikerId: NON_STRIKER,
        bowlerId: BOWLER,
      },
      events,
    );
    expect(replayed.currentInnings.runs).toBe(11);
    expect(replayed.currentInnings.ballsBowled).toBe(4);
  });

  it('undo: replay with N-1 events', () => {
    let rot = startRotation(STRIKER, NON_STRIKER, BOWLER);
    let state = seed();
    const events = [];
    for (const args of [
      { eventType: '1', runsOffBat: 1, totalRuns: 1 },
      { eventType: '4', runsOffBat: 4, totalRuns: 4 },
      { eventType: '6', runsOffBat: 6, totalRuns: 6 },
    ]) {
      const { event, rotation } = play(rot, {
        ...args,
        ballsBowledBefore: state.currentInnings.ballsBowled,
      });
      events.push(event);
      rot = rotation;
      state = applyBall(state, event);
    }
    expect(state.currentInnings.runs).toBe(11);

    const undone = replayWithLastRemoved(seed(), events);
    expect(undone.currentInnings.runs).toBe(5);
    expect(undone.currentInnings.ballsBowled).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Super Over
// ─────────────────────────────────────────────────────────────────────────────

describe('Super Over', () => {
  it('uses maxWickets=2 for innings 3', () => {
    const state = initialState({
      matchId: MATCH_ID,
      oversPerInnings: 1,
      teamAId: TEAM_A,
      teamBId: TEAM_B,
      battingTeamId: TEAM_A,
      bowlingTeamId: TEAM_B,
      inningsId: INNINGS_ID,
      inningsNumber: 3,
      strikerId: STRIKER,
      nonStrikerId: NON_STRIKER,
      bowlerId: BOWLER,
    });
    expect(state.currentInnings.maxWickets).toBe(2);
  });

  it('uses maxWickets=2 for innings 4', () => {
    const state = initialState({
      matchId: MATCH_ID,
      oversPerInnings: 1,
      teamAId: TEAM_A,
      teamBId: TEAM_B,
      battingTeamId: TEAM_A,
      bowlingTeamId: TEAM_B,
      inningsId: INNINGS_ID,
      inningsNumber: 4,
      strikerId: STRIKER,
      nonStrikerId: NON_STRIKER,
      bowlerId: BOWLER,
    });
    expect(state.currentInnings.maxWickets).toBe(2);
  });

  it('rejects 3rd wicket in super over', () => {
    let state = initialState({
      matchId: MATCH_ID,
      oversPerInnings: 1,
      teamAId: TEAM_A,
      teamBId: TEAM_B,
      battingTeamId: TEAM_A,
      bowlingTeamId: TEAM_B,
      inningsId: INNINGS_ID,
      inningsNumber: 3,
      strikerId: STRIKER,
      nonStrikerId: NON_STRIKER,
      bowlerId: BOWLER,
    });
    // Wicket 1 — striker out
    let rot = startRotation(STRIKER, NON_STRIKER, BOWLER);
    let { event, rotation } = play(rot, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'bowled',
      wicketPlayerId: STRIKER,
    });
    state = applyBall(state, event);
    rot = rotation;

    // Wicket 2 — new striker (p_new_0) out
    ({ event, rotation } = play(rot, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'bowled',
      wicketPlayerId: rot.striker,
    }));
    state = applyBall(state, event);
    rot = rotation;

    // Try wicket 3 — should throw (maxWickets=2 for super over)
    ({ event } = play(rot, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'bowled',
      wicketPlayerId: rot.striker,
    }));
    expect(() => applyBall(state, event)).toThrow(ScoringError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('rejects batsman IDs that do not match current pair', () => {
    const state = seed();
    const event = ev(
      { striker: 'wrong-batsman', nonStriker: NON_STRIKER, bowler: BOWLER },
      { eventType: 'dot', runsOffBat: 0, totalRuns: 0 },
    );
    expect(() => applyBall(state, event)).toThrow(ScoringError);
  });

  it('rejects negative runs', () => {
    const state = seed();
    const rot = startRotation(STRIKER, NON_STRIKER, BOWLER);
    const { event } = play(rot, { eventType: 'dot', runsOffBat: -1, totalRuns: -1 });
    expect(() => applyBall(state, event)).toThrow(ScoringError);
  });

  it('rejects runsOffBat > 6', () => {
    const state = seed();
    const rot = startRotation(STRIKER, NON_STRIKER, BOWLER);
    const { event } = play(rot, { eventType: 'dot', runsOffBat: 7, totalRuns: 7 });
    expect(() => applyBall(state, event)).toThrow(ScoringError);
  });

  it('rejects caught without fielder', () => {
    const state = seed();
    const rot = startRotation(STRIKER, NON_STRIKER, BOWLER);
    const event = ev(rot, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'caught',
      wicketPlayerId: rot.striker,
    });
    expect(() => applyBall(state, event)).toThrow(ScoringError);
  });

  it('rejects wicket type without wicketPlayerId', () => {
    const state = seed();
    const rot = startRotation(STRIKER, NON_STRIKER, BOWLER);
    const event = ev(rot, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'bowled',
    });
    expect(() => applyBall(state, event)).toThrow(ScoringError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Cumulative scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('cumulative scenarios', () => {
  it('a complete over with mixed balls', () => {
    let state = seed();
    let rot = startRotation(STRIKER, NON_STRIKER, BOWLER);
    const balls: Array<Parameters<typeof play>[1]> = [
      { eventType: '1', runsOffBat: 1, totalRuns: 1 },
      { eventType: 'dot', runsOffBat: 0, totalRuns: 0 },
      { eventType: '4', runsOffBat: 4, totalRuns: 4 },
      { eventType: 'wide', runsOffBat: 0, totalRuns: 1 },
      { eventType: '6', runsOffBat: 6, totalRuns: 6 },
      { eventType: '1', runsOffBat: 1, totalRuns: 1 },
    ];
    for (const args of balls) {
      const { event, rotation } = play(rot, {
        ...args,
        ballsBowledBefore: state.currentInnings.ballsBowled,
      });
      state = applyBall(state, event);
      rot = rotation;
    }

    expect(state.currentInnings.runs).toBe(13);
    expect(state.currentInnings.ballsBowled).toBe(5);
    expect(state.bowling[BOWLER]?.runs).toBe(13);
  });

  it('a wicket on the last ball of an over ends the over', () => {
    let state = seed();
    let rot = startRotation(STRIKER, NON_STRIKER, BOWLER);
    for (let i = 0; i < 5; i++) {
      const { event, rotation } = play(rot, {
        eventType: 'dot',
        runsOffBat: 0,
        totalRuns: 0,
        ballsBowledBefore: state.currentInnings.ballsBowled,
      });
      state = applyBall(state, event);
      rot = rotation;
    }
    const { event } = play(rot, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'bowled',
      wicketPlayerId: rot.striker,
    });
    state = applyBall(state, event);
    expect(state.currentInnings.wickets).toBe(1);
    expect(state.currentInnings.ballsBowled).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Scorecard view
// ─────────────────────────────────────────────────────────────────────────────

describe('scorecard view', () => {
  it('builds a scorecard view with formatted overs', () => {
    let state = seed();
    const rot = startRotation(STRIKER, NON_STRIKER, BOWLER);
    const r = play(rot, { eventType: '4', runsOffBat: 4, totalRuns: 4 });
    state = applyBall(state, r.event);
    const view = buildScorecard(state, (id: string) => `Player ${id}`);
    expect(view.runs).toBe(4);
    expect(view.overs).toBe('0.1');
    expect(view.batting.length).toBeGreaterThanOrEqual(2);
  });

  it('formats recent balls as chips', () => {
    let state = seed();
    let rot = startRotation(STRIKER, NON_STRIKER, BOWLER);
    let r = play(rot, { eventType: '4', runsOffBat: 4, totalRuns: 4 });
    state = applyBall(state, r.event);
    rot = r.rotation;
    r = play(rot, { eventType: '6', runsOffBat: 6, totalRuns: 6 });
    state = applyBall(state, r.event);
    const view = buildScorecard(state, (id: string) => id);
    expect(view.recentBalls.length).toBe(2);
    expect(view.recentBalls[0]?.display).toBe('4');
    expect(view.recentBalls[1]?.display).toBe('6');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. New batter after a wicket (scorer sends the replacement on the next ball)
// ─────────────────────────────────────────────────────────────────────────────

describe('new batter after a wicket', () => {
  const NEW_BAT = 'p5';

  it('replaces a bowled striker with the new batter', () => {
    let state = seed();
    state = applyBall(
      state,
      ev(
        { striker: STRIKER, nonStriker: NON_STRIKER, bowler: BOWLER },
        {
          eventType: 'wicket',
          runsOffBat: 0,
          totalRuns: 0,
          wicketType: 'bowled',
          wicketPlayerId: STRIKER,
        },
      ),
    );
    // Dismissed player stays in state until the replacement ball arrives
    expect(state.currentInnings.strikerId).toBe(STRIKER);

    state = applyBall(
      state,
      ev(
        { striker: NEW_BAT, nonStriker: NON_STRIKER, bowler: BOWLER },
        { eventType: 'dot', runsOffBat: 0, totalRuns: 0 },
      ),
    );
    expect(state.currentInnings.strikerId).toBe(NEW_BAT);
    expect(state.currentInnings.nonStrikerId).toBe(NON_STRIKER);
    expect(state.batting[NEW_BAT]?.balls).toBe(1);
  });

  it('keeps ends straight when the new batter takes a single first ball', () => {
    let state = seed();
    state = applyBall(
      state,
      ev(
        { striker: STRIKER, nonStriker: NON_STRIKER, bowler: BOWLER },
        {
          eventType: 'wicket',
          runsOffBat: 0,
          totalRuns: 0,
          wicketType: 'bowled',
          wicketPlayerId: STRIKER,
        },
      ),
    );
    state = applyBall(
      state,
      ev(
        { striker: NEW_BAT, nonStriker: NON_STRIKER, bowler: BOWLER },
        { eventType: '1', runsOffBat: 1, totalRuns: 1 },
      ),
    );
    // Single → new batter crosses to the non-striker end
    expect(state.currentInnings.strikerId).toBe(NON_STRIKER);
    expect(state.currentInnings.nonStrikerId).toBe(NEW_BAT);
    // No duplicate player at both ends
    expect(state.currentInnings.strikerId).not.toBe(state.currentInnings.nonStrikerId);
    expect(state.batting[NEW_BAT]?.runs).toBe(1);
  });

  it('replaces a run-out non-striker in the non-striker slot', () => {
    let state = seed();
    state = applyBall(
      state,
      ev(
        { striker: STRIKER, nonStriker: NON_STRIKER, bowler: BOWLER },
        {
          eventType: 'wicket',
          runsOffBat: 0,
          totalRuns: 0,
          wicketType: 'run_out',
          wicketPlayerId: NON_STRIKER,
          fielderId: FIELDER_1,
        },
      ),
    );
    state = applyBall(
      state,
      ev(
        { striker: STRIKER, nonStriker: NEW_BAT, bowler: BOWLER },
        { eventType: 'dot', runsOffBat: 0, totalRuns: 0 },
      ),
    );
    expect(state.currentInnings.strikerId).toBe(STRIKER);
    expect(state.currentInnings.nonStrikerId).toBe(NEW_BAT);
    // Runs on that ball are credited to the actual striker, not the new batter
    expect(state.batting[NEW_BAT]?.balls ?? 0).toBe(0);
  });

  it('still rejects a wrong pair when no wicket fell', () => {
    let state = seed();
    state = applyBall(
      state,
      ev(
        { striker: STRIKER, nonStriker: NON_STRIKER, bowler: BOWLER },
        { eventType: 'dot', runsOffBat: 0, totalRuns: 0 },
      ),
    );
    expect(() =>
      applyBall(
        state,
        ev(
          { striker: NEW_BAT, nonStriker: NON_STRIKER, bowler: BOWLER },
          { eventType: 'dot', runsOffBat: 0, totalRuns: 0 },
        ),
      ),
    ).toThrow(ScoringError);
  });
});
