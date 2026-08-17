/**
 * Laws of cricket, asserted over every delivery sequence rather than a few.
 *
 * The 58 example tests next door all pass while several rules are wrong, and
 * that is not a gap in diligence — it is what example tests are. Someone has
 * to imagine the case before they can assert it, and nobody imagined asking
 * who was on strike after a plain wide.
 *
 * These state rules that must hold for *any* sequence and let fast-check hunt
 * for the counterexample. When one fails it shrinks to the smallest input that
 * still breaks — usually a single delivery, which is a bug report you can act
 * on rather than a 200-ball haystack.
 *
 * ─── How the generator stays honest ─────────────────────────────────────────
 *
 * The engine rejects an event whose batters do not match the pair at the
 * crease, so a generator that invented ids would spend its whole budget
 * throwing ScoringError and assert nothing. Instead `drive()` produces a
 * *decision* — "a wide", "a single", "bowled" — and reads the pair and the
 * bowler back out of engine state to build the event.
 *
 * That direction matters. The driver never computes rotation itself, so a
 * property about rotation cannot accidentally restate the implementation it is
 * testing. The engine says who is on strike; the properties say who *should*
 * be, from the laws.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { applyBall } from '../engine';
import { initialState } from '../compute';
import { TEAM_WICKET_COUNTED } from '../rules';
import {
  asInningsId,
  asPlayerId,
  type BallEventInput,
  type MatchState,
  type WicketType,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Cast
// ─────────────────────────────────────────────────────────────────────────────

/** Eleven batters, so a side can be bowled out without running out of people. */
const BATTERS = Array.from({ length: 11 }, (_, i) => `bat${i + 1}`);
/** Two bowlers is the minimum that satisfies Law 17.6 (no consecutive overs). */
const BOWLERS = ['bowl1', 'bowl2'] as const;
const FIELDER = 'field1';

// ─────────────────────────────────────────────────────────────────────────────
// Decisions — what a scorer taps, before it is turned into an event
// ─────────────────────────────────────────────────────────────────────────────

type Decision =
  | { kind: 'runs'; runs: 0 | 1 | 2 | 3 | 4 | 6 }
  | { kind: 'wide' | 'no_ball' | 'bye' | 'leg_bye'; total: number }
  | { kind: 'wicket'; wicket: WicketType };

/** Dismissals that are unambiguous for a driver: they take the striker only. */
const STRIKER_WICKETS: WicketType[] = ['bowled', 'caught', 'lbw'];

const arbDecision: fc.Arbitrary<Decision> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.constantFrom(0, 1, 2, 3, 4, 6).map((runs) => ({ kind: 'runs', runs })),
  },
  {
    weight: 2,
    arbitrary: fc
      .tuple(fc.constantFrom('wide', 'no_ball'), fc.integer({ min: 1, max: 5 }))
      .map(([kind, total]) => ({ kind, total })),
  },
  {
    weight: 2,
    arbitrary: fc
      .tuple(fc.constantFrom('bye', 'leg_bye'), fc.integer({ min: 1, max: 4 }))
      .map(([kind, total]) => ({ kind, total })),
  },
  {
    weight: 1,
    arbitrary: fc.constantFrom(...STRIKER_WICKETS).map((wicket) => ({ kind: 'wicket', wicket })),
  },
) as fc.Arbitrary<Decision>;

// ─────────────────────────────────────────────────────────────────────────────
// Driver
// ─────────────────────────────────────────────────────────────────────────────

type DriveOpts = {
  overs?: number;
  inningsNumber?: 1 | 2 | 3 | 4;
  maxWickets?: number;
  target?: number;
};

function seed(opts: DriveOpts = {}): MatchState {
  return initialState({
    matchId: 'm1',
    oversPerInnings: opts.overs ?? 20,
    teamAId: 'A',
    teamBId: 'B',
    battingTeamId: 'A',
    bowlingTeamId: 'B',
    inningsId: 'i1',
    inningsNumber: opts.inningsNumber ?? 1,
    strikerId: BATTERS[0]!,
    nonStrikerId: BATTERS[1]!,
    bowlerId: BOWLERS[0],
    maxWickets: opts.maxWickets,
    target: opts.target,
  });
}

/**
 * Turn a decision into an event for the pair currently at the crease.
 *
 * `runsOffBat` versus `extraRuns` follows the mobile scorer exactly: a wide is
 * entirely extras, a no-ball is a one-run penalty plus whatever was struck,
 * byes and leg-byes are entirely extras. Matching it means these properties
 * test the payloads the app actually sends.
 */
function toEvent(
  d: Decision,
  striker: string,
  nonStriker: string,
  bowler: string,
  freeHit: boolean,
): BallEventInput {
  const base = {
    inningsId: asInningsId('i1'),
    batsmanId: asPlayerId(striker),
    nonStrikerId: asPlayerId(nonStriker),
    bowlerId: asPlayerId(bowler),
  };

  switch (d.kind) {
    case 'runs':
      return {
        ...base,
        eventType: d.runs === 0 ? 'dot' : (String(d.runs) as BallEventInput['eventType']),
        runsOffBat: d.runs,
        extraRuns: 0,
      };
    case 'no_ball':
      return { ...base, eventType: 'no_ball', runsOffBat: d.total - 1, extraRuns: 1 };
    case 'wide':
    case 'bye':
    case 'leg_bye':
      return { ...base, eventType: d.kind, runsOffBat: 0, extraRuns: d.total };
    case 'wicket': {
      // Only a run-out can dismiss on a free hit (Law 21.18), so honour that
      // here rather than generating an event the engine will refuse.
      const wicket: WicketType = freeHit ? 'run_out' : d.wicket;
      return {
        ...base,
        eventType: 'wicket',
        runsOffBat: 0,
        extraRuns: 0,
        wicketType: wicket,
        wicketPlayerId: asPlayerId(striker),
        fielderId: asPlayerId(FIELDER),
      };
    }
  }
}

/**
 * Apply a sequence of decisions, reading the pair and bowler from engine state.
 *
 * Errors are deliberately not swallowed. A ScoringError here means the driver
 * built something invalid, which is a bug in this file and should fail loudly
 * rather than quietly shrink the tested domain to nothing.
 */
function drive(decisions: Decision[], opts: DriveOpts = {}) {
  let state = seed(opts);
  const applied: BallEventInput[] = [];
  let nextBatter = 2;

  for (const d of decisions) {
    if (state.currentInnings.status === 'completed') break;

    const inn = state.currentInnings;
    let striker = String(inn.strikerId);
    let nonStriker = String(inn.nonStrikerId);

    // After a counted wicket the engine holds the dismissed batter in place
    // until the next event names a replacement. That is the scorer's job, and
    // here it is the driver's.
    const last = state.balls[state.balls.length - 1];
    if (last?.wicketType && last.wicketPlayerId && TEAM_WICKET_COUNTED.has(last.wicketType)) {
      const out = String(last.wicketPlayerId);
      if (nextBatter >= BATTERS.length) break; // side is out of batters
      if (striker === out) striker = BATTERS[nextBatter++]!;
      else if (nonStriker === out) nonStriker = BATTERS[nextBatter++]!;
    }

    // Alternate ends every over, which satisfies Law 17.6 by construction.
    const bowler = Math.floor(inn.ballsBowled / 6) % 2 === 0 ? BOWLERS[0] : BOWLERS[1];

    const event = toEvent(d, striker, nonStriker, bowler, inn.isFreeHitNext);
    state = applyBall(state, event);
    applied.push(event);
  }

  return { state, applied };
}

/** A sequence long enough to cross several overs and a few wickets. */
const arbSequence = fc.array(arbDecision, { minLength: 1, maxLength: 60 });

/** Real work per run, so the default per-case deadline does not cause flakes. */
const RUNS = { numRuns: 300 };

// ═════════════════════════════════════════════════════════════════════════════
// Part 1 — properties that encode a law the engine is suspected of breaking
// ═════════════════════════════════════════════════════════════════════════════

describe('Law 22 / 21 — the penalty run does not change the strike', () => {
  /**
   * A wide or no-ball carries a one-run penalty that nobody ran. Strike
   * changes only when the batters physically cross, so a delivery whose only
   * run is the penalty must leave the striker where they were.
   */
  it('a wide or no-ball with no runs run leaves the striker in place', () => {
    fc.assert(
      fc.property(fc.constantFrom('wide' as const, 'no_ball' as const), (kind) => {
        const before = seed();
        const { state } = drive([{ kind, total: 1 }]);
        expect(String(state.currentInnings.strikerId)).toBe(
          String(before.currentInnings.strikerId),
        );
      }),
      RUNS,
    );
  });

  /**
   * The same rule one level up: on a no-ball it is the runs off the bat that
   * decide, so a no-ball hit for four leaves the striker on strike.
   */
  it('a no-ball struck for an even number of runs leaves the striker in place', () => {
    const before = seed();
    // total = 5 → one penalty + four off the bat.
    const { state } = drive([{ kind: 'no_ball', total: 5 }]);
    expect(String(state.currentInnings.strikerId)).toBe(String(before.currentInnings.strikerId));
  });
});

describe('Law 17 — crossing and the change of ends compose', () => {
  /**
   * The single off the last ball of an over.
   *
   * Two things happen and they cancel: the batters cross, then the next over
   * is bowled from the other end. The batter who ran is now at the end being
   * bowled to, so they keep the strike — which is exactly why a tail-ender
   * takes one off the fifth ball and not the sixth.
   *
   * So a change of ends is not "always swap"; it is a second swap composed
   * with whatever the running did. Odd runs on the last ball means no net
   * change.
   */
  it('a single off the last ball of an over keeps the striker on strike', () => {
    const opener = String(seed().currentInnings.strikerId);
    const { state } = drive([
      { kind: 'runs', runs: 0 },
      { kind: 'runs', runs: 0 },
      { kind: 'runs', runs: 0 },
      { kind: 'runs', runs: 0 },
      { kind: 'runs', runs: 0 },
      { kind: 'runs', runs: 1 },
    ]);
    expect(state.currentInnings.ballsBowled).toBe(6);
    expect(String(state.currentInnings.strikerId)).toBe(opener);
  });

  /** And a dot off the last ball does hand the strike over. */
  it('a dot off the last ball of an over hands the strike over', () => {
    const s = seed();
    const opener = String(s.currentInnings.strikerId);
    const partner = String(s.currentInnings.nonStrikerId);
    const { state } = drive(Array.from({ length: 6 }, () => ({ kind: 'runs', runs: 0 }) as const));
    expect(String(state.currentInnings.strikerId)).toBe(partner);
    expect(String(state.currentInnings.nonStrikerId)).toBe(opener);
  });
});

describe('Law 21.18 — a free hit survives an illegal delivery', () => {
  /**
   * The free hit is granted for the *next delivery*, and a wide is not a
   * delivery — it is re-bowled. So it persists until a legal ball is bowled.
   */
  it('a wide after a no-ball does not consume the free hit', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), (wideRuns) => {
        const { state } = drive([
          { kind: 'no_ball', total: 1 },
          { kind: 'wide', total: wideRuns },
        ]);
        expect(state.currentInnings.isFreeHitNext).toBe(true);
      }),
      RUNS,
    );
  });

  it('a legal delivery does consume it', () => {
    const { state } = drive([
      { kind: 'no_ball', total: 1 },
      { kind: 'runs', runs: 0 },
    ]);
    expect(state.currentInnings.isFreeHitNext).toBe(false);
  });
});

describe('maiden overs', () => {
  /** Six legal balls, no run off the bat, no extra — one maiden. */
  it('an over of six dots is a maiden for the bowler', () => {
    const { state } = drive(Array.from({ length: 6 }, () => ({ kind: 'runs', runs: 0 }) as const));
    expect(state.currentInnings.ballsBowled).toBe(6);
    expect(state.bowling[BOWLERS[0]]?.maidens).toBe(1);
  });

  it('an over with a run in it is not a maiden', () => {
    const { state } = drive([
      { kind: 'runs', runs: 0 },
      { kind: 'runs', runs: 0 },
      { kind: 'runs', runs: 1 },
      { kind: 'runs', runs: 0 },
      { kind: 'runs', runs: 0 },
      { kind: 'runs', runs: 0 },
    ]);
    expect(state.bowling[BOWLERS[0]]?.maidens).toBe(0);
  });
});

describe('an innings ends at its own length', () => {
  /**
   * A Super Over is one over, whatever the match is. The engine reads the
   * match's overs limit, which is the wrong number for innings 3 and 4.
   */
  it('a super over is complete after six legal balls', () => {
    const { state } = drive(
      Array.from({ length: 6 }, () => ({ kind: 'runs', runs: 1 }) as const),
      { overs: 20, inningsNumber: 3, maxWickets: 2 },
    );
    expect(state.currentInnings.ballsBowled).toBe(6);
    expect(state.currentInnings.status).toBe('completed');
  });
});

describe('Law 24 — byes and leg-byes are not charged to the bowler', () => {
  /**
   * A bye is a run taken because the keeper missed it; a leg-bye came off the
   * body. Neither is the bowler's fault and neither enters their analysis.
   * The wide and no-ball penalties do.
   *
   * This matters beyond the scorecard: lib/db/stats.ts computes career
   * economy with byes excluded, so if the engine includes them the bowling
   * figures on a match card and on a career page disagree about the same over.
   */
  it('a bye does not appear in the bowler runs conceded', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('bye' as const, 'leg_bye' as const),
        fc.integer({ min: 1, max: 4 }),
        (kind, total) => {
          const { state } = drive([{ kind, total }]);
          expect(state.bowling[BOWLERS[0]]?.runs).toBe(0);
        },
      ),
      RUNS,
    );
  });
});

describe('the pair at the crease', () => {
  /**
   * The strongest invariant in the file: one person cannot be at both ends.
   * It should survive any sequence, including every wicket and replacement.
   */
  it('the striker and non-striker are never the same player', () => {
    fc.assert(
      fc.property(arbSequence, (decisions) => {
        const { state } = drive(decisions);
        expect(String(state.currentInnings.strikerId)).not.toBe(
          String(state.currentInnings.nonStrikerId),
        );
      }),
      RUNS,
    );
  });

  /** Nobody bats on after being dismissed. */
  it('a dismissed batter never faces another ball', () => {
    fc.assert(
      fc.property(arbSequence, (decisions) => {
        const { state } = drive(decisions);
        const dismissed = new Set(
          state.balls
            .filter((b) => b.wicketType && TEAM_WICKET_COUNTED.has(b.wicketType))
            .map((b) => String(b.wicketPlayerId)),
        );
        // Every ball after a dismissal must be faced by somebody else.
        for (let i = 0; i < state.balls.length; i++) {
          const ball = state.balls[i]!;
          const earlier = state.balls.slice(0, i);
          const alreadyOut = new Set(
            earlier
              .filter((b) => b.wicketType && TEAM_WICKET_COUNTED.has(b.wicketType))
              .map((b) => String(b.wicketPlayerId)),
          );
          expect(alreadyOut.has(String(ball.batsmanId))).toBe(false);
        }
        expect(dismissed.size).toBe(state.currentInnings.wickets);
      }),
      RUNS,
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Part 2 — invariants that should already hold, kept as a net under changes
// ═════════════════════════════════════════════════════════════════════════════

describe('conservation', () => {
  it('the innings total is the sum of every delivery', () => {
    fc.assert(
      fc.property(arbSequence, (decisions) => {
        const { state } = drive(decisions);
        const summed = state.balls.reduce((n, b) => n + b.totalRuns, 0);
        expect(state.currentInnings.runs).toBe(summed);
      }),
      RUNS,
    );
  });

  it('balls bowled counts exactly the legal deliveries', () => {
    fc.assert(
      fc.property(arbSequence, (decisions) => {
        const { state } = drive(decisions);
        const legal = state.balls.filter((b) => b.isLegalDelivery).length;
        expect(state.currentInnings.ballsBowled).toBe(legal);
      }),
      RUNS,
    );
  });

  it('extras equal the sum of the extra runs on each delivery', () => {
    fc.assert(
      fc.property(arbSequence, (decisions) => {
        const { state } = drive(decisions);
        const summed = state.balls.reduce((n, b) => n + b.extraRuns, 0);
        expect(state.currentInnings.extras).toBe(summed);
      }),
      RUNS,
    );
  });

  /**
   * A wide is not a fair delivery, so it is not one the striker faced.
   *
   * Stated only about wides on purpose. The first draft of this property
   * asserted `faced <= ballsBowled`, which fast-check broke in two deliveries
   * — a no-ball is a ball faced but not a legal delivery, so the bound was
   * simply wrong. That was a bad property rather than a bug, and the weaker
   * claim below is the one every source agrees on.
   */
  it('a wide is never counted as a ball faced', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), fc.integer({ min: 1, max: 5 }), (n, runs) => {
        const { state } = drive(Array.from({ length: n }, () => ({ kind: 'wide', total: runs })));
        const faced = Object.values(state.batting).reduce((sum, b) => sum + b.balls, 0);
        expect(faced).toBe(0);
      }),
      RUNS,
    );
  });
});

describe('monotonicity', () => {
  /** Score, wickets and balls only ever go up. A ball never takes runs away. */
  it('runs, wickets and legal balls never decrease', () => {
    fc.assert(
      fc.property(arbSequence, (decisions) => {
        let prev = seed();
        let state = seed();
        const applied = drive(decisions).applied;

        for (const event of applied) {
          state = applyBall(state, event);
          expect(state.currentInnings.runs).toBeGreaterThanOrEqual(prev.currentInnings.runs);
          expect(state.currentInnings.wickets).toBeGreaterThanOrEqual(prev.currentInnings.wickets);
          expect(state.currentInnings.ballsBowled).toBeGreaterThanOrEqual(
            prev.currentInnings.ballsBowled,
          );
          prev = state;
        }
      }),
      RUNS,
    );
  });

  it('an innings never exceeds its wicket allowance or its over limit', () => {
    fc.assert(
      fc.property(arbSequence, (decisions) => {
        const { state } = drive(decisions, { overs: 5 });
        expect(state.currentInnings.wickets).toBeLessThanOrEqual(state.currentInnings.maxWickets);
        expect(state.currentInnings.ballsBowled).toBeLessThanOrEqual(5 * 6);
      }),
      RUNS,
    );
  });
});
