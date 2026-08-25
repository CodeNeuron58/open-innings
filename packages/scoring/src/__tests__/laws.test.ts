/**
 * The rules about *who and what*, rather than about arithmetic.
 *
 * `engine.test.ts` next door asserts what a delivery is worth. Everything here
 * asserts whether the delivery could have happened at all: which dismissals a
 * ball of that kind can produce, who was on the field to be dismissed, and who
 * is allowed to bowl it.
 *
 * Every case below was accepted by the engine before this file existed, and
 * all 77 tests stayed green throughout — which is the reason it exists. An
 * example test only covers what someone thought to imagine, and nobody
 * imagined dismissing a batter who was not batting.
 */
import { describe, it, expect } from 'vitest';
import { applyBall } from '../engine';
import { initialState } from '../compute';
import {
  asInningsId,
  asPlayerId,
  ScoringError,
  type BallEventInput,
  type MatchState,
} from '../types';

const seedWith = (over: Partial<Parameters<typeof initialState>[0]> = {}): MatchState =>
  initialState({
    matchId: 'm1',
    oversPerInnings: 20,
    teamAId: 'A',
    teamBId: 'B',
    battingTeamId: 'A',
    bowlingTeamId: 'B',
    inningsId: 'i1',
    inningsNumber: 1,
    strikerId: 'b1',
    nonStrikerId: 'b2',
    bowlerId: 'w1',
    ...over,
  });

/** A delivery from whoever the engine currently has at the crease. */
function ball(state: MatchState, over: Partial<BallEventInput> = {}): BallEventInput {
  const inn = state.currentInnings;
  return {
    inningsId: asInningsId('i1'),
    eventType: 'dot',
    runsOffBat: 0,
    extraRuns: 0,
    batsmanId: inn.strikerId,
    nonStrikerId: inn.nonStrikerId,
    bowlerId: inn.currentBowlerId,
    ...over,
  };
}

const bowl = (state: MatchState, over: Partial<BallEventInput> = {}): MatchState =>
  applyBall(state, ball(state, over));

/** The ScoringError code a call raises, or null if it was accepted. */
function codeFor(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    if (error instanceof ScoringError) return error.code;
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Law 21 / Law 22.6 — which dismissals a delivery can produce
// ─────────────────────────────────────────────────────────────────────────────

describe('Law 22.6 — dismissals off a wide', () => {
  const offAWide = (wicketType: string) =>
    codeFor(() =>
      bowl(seedWith(), {
        eventType: 'wide',
        extraRuns: 1,
        wicketType: wicketType as BallEventInput['wicketType'],
        wicketPlayerId: asPlayerId('b1'),
        fielderId: asPlayerId('f1'),
      }),
    );

  // A wide is by definition not a ball the striker could have played, which is
  // the whole reason these three are impossible.
  it.each(['bowled', 'caught', 'caught_behind', 'lbw'])('refuses %s', (wicketType) => {
    expect(offAWide(wicketType)).toBe('INVALID_WICKET_FOR_DELIVERY');
  });

  // Stumped off a wide is not an edge case — it is the classic leg-side wide
  // that beats the batter and the keeper takes the bails off.
  it.each(['stumped', 'run_out', 'hit_wicket', 'obstructing_field'])('allows %s', (wicketType) => {
    expect(offAWide(wicketType)).toBeNull();
  });
});

describe('Law 21 — dismissals off a no ball', () => {
  const offANoBall = (wicketType: string) =>
    codeFor(() =>
      bowl(seedWith(), {
        eventType: 'no_ball',
        extraRuns: 1,
        wicketType: wicketType as BallEventInput['wicketType'],
        wicketPlayerId: asPlayerId('b1'),
        fielderId: asPlayerId('f1'),
      }),
    );

  it.each(['bowled', 'caught', 'caught_behind', 'lbw', 'stumped', 'hit_wicket'])(
    'refuses %s',
    (wicketType) => {
      expect(offANoBall(wicketType)).toBe('INVALID_WICKET_FOR_DELIVERY');
    },
  );

  it.each(['run_out', 'obstructing_field', 'hit_the_ball_twice'])('allows %s', (wicketType) => {
    expect(offANoBall(wicketType)).toBeNull();
  });
});

describe('Law 21.18 — dismissals on a free hit', () => {
  /** A no ball first, so the next delivery is the free hit. */
  const afterANoBall = () => bowl(seedWith(), { eventType: 'no_ball', extraRuns: 1 });

  it('the delivery after a no ball is a free hit', () => {
    expect(afterANoBall().currentInnings.isFreeHitNext).toBe(true);
  });

  const onAFreeHit = (wicketType: string, over: Partial<BallEventInput> = {}) =>
    codeFor(() =>
      bowl(afterANoBall(), {
        eventType: 'wicket',
        wicketType: wicketType as BallEventInput['wicketType'],
        wicketPlayerId: asPlayerId('b1'),
        fielderId: asPlayerId('f1'),
        ...over,
      }),
    );

  it.each(['bowled', 'caught', 'lbw', 'stumped'])('refuses %s', (wicketType) => {
    expect(onAFreeHit(wicketType)).toBe('INVALID_FREE_HIT_WICKET');
  });

  // A free hit carries a no ball's dismissals — all three of them. The set was
  // `{run_out}` alone, so these two were refused when the Law allows them.
  it.each(['run_out', 'obstructing_field', 'hit_the_ball_twice'])('allows %s', (wicketType) => {
    expect(onAFreeHit(wicketType)).toBeNull();
  });

  it('a free hit called wide allows only what both laws allow', () => {
    // Law 22.6 permits a stumping; Law 21.18 does not. The engine applies each
    // check on its own, so the intersection needs stating nowhere.
    const wide = { eventType: 'wide' as const, extraRuns: 1 };
    expect(onAFreeHit('stumped', wide)).toBe('INVALID_FREE_HIT_WICKET');
    expect(onAFreeHit('run_out', wide)).toBeNull();
  });
});

describe('retirements are not outcomes of the delivery', () => {
  it('a batter may retire hurt during an over containing a wide', () => {
    // NON_DELIVERY_WICKETS exempts these, or a retirement recorded against a
    // wide would be refused by Law 22.6 for no good reason.
    expect(
      codeFor(() =>
        bowl(seedWith(), {
          eventType: 'wide',
          extraRuns: 1,
          wicketType: 'retired_hurt',
          wicketPlayerId: asPlayerId('b1'),
        }),
      ),
    ).toBeNull();
  });

  it('retired hurt on a wide: replacement takes the exact crease end of the retired batter', () => {
    // b1 retires hurt off a wide. A wide does NOT rotate the strike (no runs
    // physically crossed — the wide penalty is awarded, not run). So b1 was at
    // the striker's end; the replacement (b3) must take the striker's end, and
    // b2 must remain at the non-striker's end. If the engine mis-rotates,
    // b3 would silently appear at the wrong end and the next delivery would
    // BATSMAN_NOT_ON_FIELD.
    let s = seedWith(); // b1 striker, b2 non-striker
    s = bowl(s, {
      eventType: 'wide',
      extraRuns: 1,
      wicketType: 'retired_hurt',
      wicketPlayerId: asPlayerId('b1'),
    });

    // b1 was at the striker's end; after no strike rotation on a wide,
    // that vacancy is the striker slot.
    expect(s.currentInnings.strikerId).toBe(asPlayerId('b1'));
    expect(s.currentInnings.nonStrikerId).toBe(asPlayerId('b2'));

    // Replace b1 (the striker) with b3. Must succeed — not BATSMAN_NOT_ON_FIELD.
    expect(
      codeFor(() => bowl(s, { batsmanId: asPlayerId('b3'), nonStrikerId: asPlayerId('b2') })),
    ).toBeNull();
  });

  it('retired hurt on a wide with odd extra runs: replacement crease end reflects strike rotation', () => {
    // Wide (1 penalty) + 1 run physically crossed = 2 total extraRuns.
    // 1 run physically crossed is ODD → strike rotates.
    // b1 (striker) crosses to non-striker's end before retiring.
    // Therefore, b2 becomes the striker, and the replacement b3 must come in at non-striker.
    let s = seedWith();
    s = bowl(s, {
      eventType: 'wide',
      extraRuns: 2, // 1 penalty + 1 physically run = 1 run crossed (ODD -> strike swap)
      wicketType: 'retired_hurt',
      wicketPlayerId: asPlayerId('b1'),
    });

    // After odd crossing, b1 ended up at non-striker end, and b2 at striker end.
    expect(s.currentInnings.strikerId).toBe(asPlayerId('b2'));
    expect(s.currentInnings.nonStrikerId).toBe(asPlayerId('b1'));

    // Replace b1 (non-striker) with b3. Must succeed — not BATSMAN_NOT_ON_FIELD.
    expect(
      codeFor(() => bowl(s, { batsmanId: asPlayerId('b2'), nonStrikerId: asPlayerId('b3') })),
    ).toBeNull();
  });

  it('retired hurt on a wide with even extra runs: replacement stays at striker end', () => {
    // Wide (1 penalty) + 2 runs physically crossed = 3 total extraRuns.
    // 2 runs physically crossed is EVEN → strike does NOT rotate.
    // b1 remains at striker's end before retiring.
    let s = seedWith();
    s = bowl(s, {
      eventType: 'wide',
      extraRuns: 3, // 1 penalty + 2 physically run = 2 runs crossed (EVEN -> no swap)
      wicketType: 'retired_hurt',
      wicketPlayerId: asPlayerId('b1'),
    });

    expect(s.currentInnings.strikerId).toBe(asPlayerId('b1'));
    expect(s.currentInnings.nonStrikerId).toBe(asPlayerId('b2'));

    // Replace b1 (striker) with b3.
    expect(
      codeFor(() => bowl(s, { batsmanId: asPlayerId('b3'), nonStrikerId: asPlayerId('b2') })),
    ).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Who was on the field
// ─────────────────────────────────────────────────────────────────────────────

describe('the dismissed player was batting', () => {
  it('refuses a dismissal of somebody who is not at the crease', () => {
    expect(
      codeFor(() =>
        bowl(seedWith(), {
          eventType: 'wicket',
          wicketType: 'bowled',
          wicketPlayerId: asPlayerId('b9'),
        }),
      ),
    ).toBe('WICKET_PLAYER_NOT_AT_CREASE');
  });

  it('a run out may take either batter', () => {
    for (const victim of ['b1', 'b2']) {
      expect(
        codeFor(() =>
          bowl(seedWith(), {
            eventType: 'wicket',
            wicketType: 'run_out',
            wicketPlayerId: asPlayerId(victim),
            fielderId: asPlayerId('f1'),
          }),
        ),
      ).toBeNull();
    }
  });
});

describe('a dismissed batter does not bat again', () => {
  /** b1 bowled, replaced by b3; then b2 bowled, leaving a vacancy. */
  function twoDown(): MatchState {
    let s = seedWith();
    s = bowl(s, { eventType: 'wicket', wicketType: 'bowled', wicketPlayerId: asPlayerId('b1') });
    s = bowl(s, { batsmanId: asPlayerId('b3'), eventType: '1', runsOffBat: 1 });
    s = bowl(s, { eventType: 'wicket', wicketType: 'bowled', wicketPlayerId: asPlayerId('b2') });
    return s;
  }

  it('refuses somebody who is already out', () => {
    const s = twoDown();
    const vacancy = s.currentInnings.strikerId === asPlayerId('b2') ? 'batsmanId' : 'nonStrikerId';
    expect(codeFor(() => bowl(s, { [vacancy]: asPlayerId('b1'), eventType: 'dot' }))).toBe(
      'BATSMAN_ALREADY_DISMISSED',
    );
  });

  it('accepts somebody who has not batted', () => {
    const s = twoDown();
    const vacancy = s.currentInnings.strikerId === asPlayerId('b2') ? 'batsmanId' : 'nonStrikerId';
    expect(codeFor(() => bowl(s, { [vacancy]: asPlayerId('b4') }))).toBeNull();
  });

  it('a retired hurt batter may come back at the fall of a wicket', () => {
    // Retiring is not being out, and returning is the whole point of it.
    let s = seedWith();
    s = bowl(s, {
      eventType: 'wicket',
      wicketType: 'retired_hurt',
      wicketPlayerId: asPlayerId('b1'),
    });
    s = bowl(s, { batsmanId: asPlayerId('b3') });
    s = bowl(s, { eventType: 'wicket', wicketType: 'bowled', wicketPlayerId: asPlayerId('b3') });

    const vacancy = s.currentInnings.strikerId === asPlayerId('b3') ? 'batsmanId' : 'nonStrikerId';
    expect(codeFor(() => bowl(s, { [vacancy]: asPlayerId('b1') }))).toBeNull();
  });

  it('refuses both batters changing at once', () => {
    let s = seedWith();
    s = bowl(s, { eventType: 'wicket', wicketType: 'bowled', wicketPlayerId: asPlayerId('b1') });
    expect(
      codeFor(() => bowl(s, { batsmanId: asPlayerId('b3'), nonStrikerId: asPlayerId('b4') })),
    ).toBe('BATSMAN_NOT_ON_FIELD');
  });

  it('refuses a replacement when nobody left the field', () => {
    const s = bowl(seedWith());
    expect(codeFor(() => bowl(s, { batsmanId: asPlayerId('b7') }))).toBe('BATSMAN_NOT_ON_FIELD');
  });

  it('refuses one batter standing at both ends', () => {
    expect(codeFor(() => bowl(seedWith(), { nonStrikerId: asPlayerId('b1') }))).toBe(
      'BATSMAN_NOT_ON_FIELD',
    );
  });
});

describe('nobody plays two roles at once', () => {
  it('a batter cannot bowl', () => {
    expect(codeFor(() => bowl(seedWith(), { bowlerId: asPlayerId('b2') }))).toBe(
      'PLAYER_IN_TWO_ROLES',
    );
  });

  it('a batter cannot field their own dismissal', () => {
    expect(
      codeFor(() =>
        bowl(seedWith(), {
          eventType: 'wicket',
          wicketType: 'caught',
          wicketPlayerId: asPlayerId('b1'),
          fielderId: asPlayerId('b2'),
        }),
      ),
    ).toBe('PLAYER_IN_TWO_ROLES');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Who is allowed to bowl
// ─────────────────────────────────────────────────────────────────────────────

/** Bowl a complete over, alternating bowlers so Law 16.2 is satisfied. */
function completeOver(state: MatchState, bowlerId: string): MatchState {
  let s = state;
  for (let i = 0; i < 6; i++) s = bowl(s, { bowlerId: asPlayerId(bowlerId) });
  return s;
}

describe('Law 17.4 — the bowler is named for the over', () => {
  it('refuses a change part-way through an over', () => {
    const s = bowl(seedWith());
    expect(codeFor(() => bowl(s, { bowlerId: asPlayerId('w2') }))).toBe('BOWLER_CHANGED_MID_OVER');
  });

  it('refuses a change after a wide has started the over', () => {
    // `ballsBowled % 6 === 0` is still true here, which is why the check reads
    // the ball log rather than the counter.
    const s = bowl(seedWith(), { eventType: 'wide', extraRuns: 1 });
    expect(codeFor(() => bowl(s, { bowlerId: asPlayerId('w2') }))).toBe('BOWLER_CHANGED_MID_OVER');
  });

  it('allows the change when the bowler cannot continue', () => {
    const s = bowl(seedWith());
    expect(
      codeFor(() => bowl(s, { bowlerId: asPlayerId('w2'), bowlerReplacedMidOver: true })),
    ).toBeNull();
  });

  it('allows a new bowler once the over is complete', () => {
    const s = completeOver(seedWith(), 'w1');
    expect(codeFor(() => bowl(s, { bowlerId: asPlayerId('w2') }))).toBeNull();
  });
});

describe('the over quota', () => {
  it('is unenforced when the match did not set one', () => {
    let s = seedWith();
    for (let over = 0; over < 6; over++) s = completeOver(s, over % 2 === 0 ? 'w1' : 'w2');
    expect(s.bowling['w1']!.balls / 6).toBe(3);
  });

  it('stops a bowler who has bowled their allowance', () => {
    let s = seedWith({ maxOversPerBowler: 2 });
    s = completeOver(s, 'w1');
    s = completeOver(s, 'w2');
    s = completeOver(s, 'w1'); // w1's second, and last
    s = completeOver(s, 'w2');
    expect(codeFor(() => bowl(s, { bowlerId: asPlayerId('w1') }))).toBe('BOWLER_QUOTA_EXCEEDED');
    expect(codeFor(() => bowl(s, { bowlerId: asPlayerId('w3') }))).toBeNull();
  });

  it('lets a bowler finish the over they are in', () => {
    // The allowance is spent in legal balls, so a wide part-way through the
    // last over does not cut it short.
    let s = seedWith({ maxOversPerBowler: 1 });
    s = bowl(s, { bowlerId: asPlayerId('w1'), eventType: 'wide', extraRuns: 1 });
    for (let i = 0; i < 5; i++) s = bowl(s, { bowlerId: asPlayerId('w1') });
    expect(codeFor(() => bowl(s, { bowlerId: asPlayerId('w1') }))).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bowler credit, and the partnership
// ─────────────────────────────────────────────────────────────────────────────

describe('Law 25 — which dismissals credit the bowler', () => {
  const creditFor = (wicketType: string, over: Partial<BallEventInput> = {}) => {
    const s = bowl(seedWith(), {
      eventType: 'wicket',
      wicketType: wicketType as BallEventInput['wicketType'],
      wicketPlayerId: asPlayerId('b1'),
      fielderId: asPlayerId('f1'),
      ...over,
    });
    return s.bowling['w1']!.wickets;
  };

  it.each(['bowled', 'caught', 'caught_behind', 'lbw', 'stumped', 'hit_wicket'])(
    'credits %s',
    (wicketType) => {
      expect(creditFor(wicketType)).toBe(1);
    },
  );

  // Law 34 is the batter striking the ball a second time. It was in the
  // credited set, which inflated bowlers' wickets on the scorecard and in
  // every career figure derived from the same list.
  it.each([
    'run_out',
    'obstructing_field',
    'handled_ball',
    'hit_the_ball_twice',
    'double_hit',
    'retired_out',
    'timed_out',
  ])('does not credit %s', (wicketType) => {
    expect(creditFor(wicketType)).toBe(0);
  });
});

describe('partnerships end when a batter walks off', () => {
  it('a retirement closes the stand', () => {
    // The team has not lost a wicket, but the pair has changed — and a stand
    // credited to two people who never batted together is simply wrong.
    let s = seedWith();
    s = bowl(s, { eventType: '4', runsOffBat: 4 });
    s = bowl(s, {
      eventType: 'wicket',
      wicketType: 'retired_hurt',
      wicketPlayerId: asPlayerId('b1'),
    });

    expect(s.currentInnings.wickets).toBe(0);
    expect(s.partnerships).toHaveLength(1);
    expect(s.partnerships[0]!.isActive).toBe(false);

    s = bowl(s, { batsmanId: asPlayerId('b3'), eventType: '1', runsOffBat: 1 });
    expect(s.partnerships).toHaveLength(2);
    expect(s.partnerships[1]!.runs).toBe(1);
  });

  it('a retirement is not a fall of wicket', () => {
    const s = bowl(seedWith(), {
      eventType: 'wicket',
      wicketType: 'retired_hurt',
      wicketPlayerId: asPlayerId('b1'),
    });
    expect(s.fallOfWickets).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validate on write, tolerate on read
// ─────────────────────────────────────────────────────────────────────────────

describe('a stored delivery is never un-bowled by a rule added later', () => {
  /*
   * `applyBall` validates *and* composes, and replay calls it for every stored
   * delivery — so validation runs on every read: scorecards, share cards, the
   * scorer console. Without a replay mode, each rule added here would
   * retroactively break every match scored before it.
   *
   * Not theoretical. The wicket sheet used to offer both squads as fielders,
   * so a catch could be credited to a batter, and `validateRoles` now refuses
   * exactly that. Strict replay would 500 the public scorecard of every match
   * containing one — a shared link, broken by a fix.
   */
  const unlawful = (state: MatchState): BallEventInput =>
    ball(state, {
      eventType: 'wicket',
      wicketType: 'caught',
      wicketPlayerId: asPlayerId('b1'),
      // In the batting side. Refused when recorded today.
      fielderId: asPlayerId('b2'),
    });

  it('refuses it when a scorer is recording it', () => {
    expect(codeFor(() => applyBall(seedWith(), unlawful(seedWith())))).toBe('PLAYER_IN_TWO_ROLES');
  });

  it('applies it when reading the ball log back', () => {
    const state = seedWith();
    const replayed = applyBall(state, unlawful(state), { mode: 'replay' });

    expect(replayed.balls).toHaveLength(1);
    expect(replayed.currentInnings.wickets).toBe(1);
  });

  it('records what it objected to, rather than swallowing it', () => {
    const state = seedWith();
    const replayed = applyBall(state, unlawful(state), { mode: 'replay' });

    expect(replayed.violations).toHaveLength(1);
    expect(replayed.violations[0]!.code).toBe('PLAYER_IN_TWO_ROLES');
    expect(replayed.violations[0]!.ballNumber).toBe(1);
  });

  it('leaves violations empty for an innings the rules are happy with', () => {
    let s = seedWith();
    for (let i = 0; i < 6; i++) s = bowl(s, { eventType: '1', runsOffBat: 1 });
    expect(s.violations).toEqual([]);
  });

  it('tolerates a dismissal thrown from composition, not validation', () => {
    // BATSMAN_ALREADY_OUT is raised inside updateBatting rather than validate,
    // so it needs its own tolerance or a stored match still fails to load.
    let s = seedWith();
    s = applyBall(
      s,
      ball(s, {
        eventType: 'wicket',
        wicketType: 'bowled',
        wicketPlayerId: asPlayerId('b1'),
      }),
      { mode: 'replay' },
    );

    // The same batter dismissed a second time — impossible, and stored.
    s = applyBall(
      s,
      {
        inningsId: asInningsId('i1'),
        eventType: 'wicket',
        runsOffBat: 0,
        extraRuns: 0,
        batsmanId: asPlayerId('b1'),
        nonStrikerId: asPlayerId('b2'),
        bowlerId: asPlayerId('w1'),
        wicketType: 'bowled',
        wicketPlayerId: asPlayerId('b1'),
      },
      { mode: 'replay' },
    );

    expect(s.balls).toHaveLength(2);
    expect(s.violations.some((v) => v.code === 'BATSMAN_ALREADY_OUT')).toBe(true);
  });
});

describe('a batter who leaves the field must be replaced before the next delivery', () => {
  const out = (state: MatchState) =>
    ball(state, {
      eventType: 'wicket',
      wicketType: 'bowled',
      wicketPlayerId: state.currentInnings.strikerId,
    });

  it('refuses the next ball when the pair is simply repeated', () => {
    // The engine leaves the dismissed batter in their slot so the next event
    // can name who came in. Repeating the pair used to be accepted, and the
    // batter who was out faced the next ball.
    const s = applyBall(seedWith(), out(seedWith()));
    expect(codeFor(() => bowl(s))).toBe('BATSMAN_NOT_REPLACED');
  });

  it('so a dismissed batter cannot go on scoring', () => {
    // Bowled for 4 off 2, then — without a replacement — 14 off 4, still
    // marked out, with the fall of wicket recorded at 4. A scorecard that
    // contradicts itself, and an innings that can pass its final wicket with
    // somebody still at the crease.
    let s = bowl(seedWith(), { eventType: '4', runsOffBat: 4 });
    s = applyBall(s, out(s));
    expect(s.batting['b1']!.runs).toBe(4);
    expect(codeFor(() => bowl(s, { eventType: '6', runsOffBat: 6 }))).toBe('BATSMAN_NOT_REPLACED');
    expect(s.batting['b1']!.runs).toBe(4);
  });

  it('accepts the next ball once a replacement is named', () => {
    const s = applyBall(seedWith(), out(seedWith()));
    const next = bowl(s, { batsmanId: asPlayerId('b3') });
    expect(next.balls).toHaveLength(2);
  });

  it('applies to a retirement too — they walked off just the same', () => {
    const s = applyBall(
      seedWith(),
      ball(seedWith(), {
        eventType: 'wicket',
        wicketType: 'retired_hurt',
        wicketPlayerId: asPlayerId('b1'),
      }),
    );
    expect(codeFor(() => bowl(s))).toBe('BATSMAN_NOT_REPLACED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Law 17.4 — parts of two consecutive overs
// ─────────────────────────────────────────────────────────────────────────────

describe('a shared over still binds the bowler who started it', () => {
  /** Six legal balls of over 0, with w1 replaced by w2 after the third. */
  function sharedFirstOver(): MatchState {
    let s = seedWith();
    for (let i = 0; i < 3; i += 1) s = bowl(s, { bowlerId: asPlayerId('w1') });
    for (let i = 0; i < 3; i += 1) {
      s = bowl(s, { bowlerId: asPlayerId('w2'), bowlerReplacedMidOver: true });
    }
    return s;
  }

  it('refuses the bowler who finished it — Law 16.2, as before', () => {
    expect(codeFor(() => bowl(sharedFirstOver(), { bowlerId: asPlayerId('w2') }))).toBe(
      'BOWLER_BOWLED_CONSECUTIVE_OVERS',
    );
  });

  it('refuses the bowler who started it and did not finish', () => {
    // w1 bowled three balls of the over and was replaced. Opening the next one
    // would have them bowling parts of two consecutive overs. `lastBowlerId`
    // holds w2, so nothing here caught this before.
    expect(codeFor(() => bowl(sharedFirstOver(), { bowlerId: asPlayerId('w1') }))).toBe(
      'BOWLER_BOWLED_PART_OF_PREVIOUS_OVER',
    );
  });

  it('allows anybody who did not bowl in it', () => {
    expect(codeFor(() => bowl(sharedFirstOver(), { bowlerId: asPlayerId('w3') }))).toBeNull();
  });

  it('still lets a bowler finish an over they started', () => {
    let s = seedWith();
    s = bowl(s, { bowlerId: asPlayerId('w1') });
    // Second ball of the same over, same bowler — the ordinary case.
    expect(codeFor(() => bowl(s, { bowlerId: asPlayerId('w1') }))).toBeNull();
  });
});

describe('a retirement does not use up a delivery', () => {
  it('does not advance the over', () => {
    /*
     * The bug: `isLegalDelivery(eventType)` answers for the delivery, and a
     * retirement is recorded as `eventType: 'wicket'`, which looks like a fair
     * ball from the event type alone. So a batter retiring hurt between
     * deliveries advanced `ballsBowled` and the over ended one ball early — a
     * ball the batting side never got, which in a tight chase decides matches.
     */
    const before = seedWith();
    const after = bowl(before, {
      eventType: 'wicket',
      wicketType: 'retired_hurt',
      wicketPlayerId: asPlayerId('b1'),
    });

    expect(after.currentInnings.ballsBowled).toBe(before.currentInnings.ballsBowled);
  });

  it('is recorded, but not as a legal delivery', () => {
    // It still belongs in the ball log — that is the only place it can be
    // attached to. What it must not do is count.
    const after = bowl(seedWith(), {
      eventType: 'wicket',
      wicketType: 'retired_hurt',
      wicketPlayerId: asPlayerId('b1'),
    });

    expect(after.balls).toHaveLength(1);
    expect(after.balls[0]!.isLegalDelivery).toBe(false);
  });

  it('does not credit the bowler with a ball either', () => {
    // Their economy is runs per over bowled, and they did not bowl this one.
    const after = bowl(seedWith(), {
      eventType: 'wicket',
      wicketType: 'retired_hurt',
      wicketPlayerId: asPlayerId('b1'),
    });

    expect(after.bowling[String(after.currentInnings.currentBowlerId)]?.balls ?? 0).toBe(0);
  });

  it('applies to retired out and timed out for the same reason', () => {
    // NON_DELIVERY_WICKETS is the whole list, and it is the engine's own.
    for (const wicketType of ['retired_out', 'timed_out'] as const) {
      const after = bowl(seedWith(), {
        eventType: 'wicket',
        wicketType,
        wicketPlayerId: asPlayerId('b1'),
      });
      expect(after.currentInnings.ballsBowled, wicketType).toBe(0);
    }
  });

  it('still counts an ordinary dismissal as a delivery', () => {
    // The guard is narrow on purpose: being bowled uses up the ball it
    // happened on, and nothing about this change may touch that.
    const after = bowl(seedWith(), {
      eventType: 'wicket',
      wicketType: 'bowled',
      wicketPlayerId: asPlayerId('b1'),
    });

    expect(after.currentInnings.ballsBowled).toBe(1);
    expect(after.balls[0]!.isLegalDelivery).toBe(true);
  });
});
