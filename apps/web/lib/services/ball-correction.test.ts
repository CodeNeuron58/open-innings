/**
 * Correcting a delivery in the middle of an innings.
 *
 * These run against the real engine, not a stand-in for it. That is the point:
 * the thing being tested is whether a rewritten innings is one the rules would
 * have accepted, and only the engine can answer that.
 *
 * The cases are the ones a scorer actually creates — a run miscounted, a wide
 * missed, the wrong bowler on an over, a wicket that never happened — plus the
 * two that must be refused rather than absorbed.
 */
import { describe, it, expect } from 'vitest';
import { applyBall, initialState } from '@open-innings/scoring';
import { correctBall, BallCorrectionError, type StoredBall } from './ball-correction';
import type { PatchBallInput } from '@open-innings/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const A = '11111111-1111-4111-8111-111111111111'; // opener, on strike
const B = '22222222-2222-4222-8222-222222222222'; // opener, non-striker
const C = '33333333-3333-4333-8333-333333333333'; // number three
const BOWL1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOWL2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const NAMES: Record<string, string> = {
  [A]: 'Arun',
  [B]: 'Bala',
  [C]: 'Chetan',
  [BOWL1]: 'Imran',
  [BOWL2]: 'Rahul',
};
const nameOf = (id: string) => NAMES[id] ?? id;

function seed() {
  return initialState({
    matchId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    oversPerInnings: 20,
    teamAId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    teamBId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    battingTeamId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    bowlingTeamId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    inningsId: INN,
    inningsNumber: 1,
    strikerId: A,
    nonStrikerId: B,
    bowlerId: BOWL1,
  });
}

/**
 * Build a stored innings the way the database holds one.
 *
 * Deliberately built by *replaying* the shorthand through the engine rather
 * than by hand: a fixture written by hand can express an innings that could
 * never have been scored, and then the tests prove something about a match
 * that cannot exist.
 */
type Shorthand = {
  type: string;
  runs?: number;
  extras?: number;
  bowler?: string;
  wicket?: string;
  out?: string;
  fielder?: string;
  /** Who walks in, for the delivery after a wicket. */
  inAt?: { striker?: string; nonStriker?: string };
};

function storedInnings(script: Shorthand[]): StoredBall[] {
  let state = seed();
  const rows: StoredBall[] = [];

  for (const s of script) {
    const striker = s.inAt?.striker ?? String(state.currentInnings.strikerId);
    const nonStriker = s.inAt?.nonStriker ?? String(state.currentInnings.nonStrikerId);
    state = applyBall(state, {
      inningsId: INN as never,
      id: `ball-${rows.length + 1}` as never,
      eventType: s.type as never,
      runsOffBat: s.runs ?? 0,
      extraRuns: s.extras ?? 0,
      batsmanId: striker as never,
      nonStrikerId: nonStriker as never,
      bowlerId: (s.bowler ?? String(state.currentInnings.currentBowlerId)) as never,
      wicketType: s.wicket as never,
      wicketPlayerId: s.out as never,
      fielderId: s.fielder as never,
    });
    const b = state.balls[state.balls.length - 1]!;
    rows.push({
      id: String(b.id),
      inningsId: INN,
      overNumber: b.overNumber,
      ballNumber: b.ballNumber,
      eventType: b.eventType,
      runsOffBat: b.runsOffBat,
      extraRuns: b.extraRuns,
      totalRuns: b.totalRuns,
      isLegalDelivery: b.isLegalDelivery,
      isFreeHit: b.isFreeHit,
      batsmanId: String(b.batsmanId),
      nonStrikerId: String(b.nonStrikerId),
      bowlerId: String(b.bowlerId),
      wicketType: b.wicketType ?? null,
      wicketPlayerId: b.wicketPlayerId ? String(b.wicketPlayerId) : null,
      fielderId: b.fielderId ? String(b.fielderId) : null,
      bowlerReplacedMidOver: b.bowlerReplacedMidOver ?? false,
      commentary: b.commentary ?? null,
    });
  }
  return rows;
}

const patch = (over: Partial<PatchBallInput> = {}): PatchBallInput =>
  ({
    eventType: 'dot',
    runsOffBat: 0,
    extraRuns: 0,
    bowlerId: BOWL1,
    ...over,
  }) as PatchBallInput;

const runs = (state: { currentInnings: { runs: number } }) => state.currentInnings.runs;

// ─────────────────────────────────────────────────────────────────────────────
// The ordinary correction
// ─────────────────────────────────────────────────────────────────────────────

describe('correcting the runs on a delivery', () => {
  it('rewrites the score and everything after it', () => {
    // Six dots, then the third is corrected to a four.
    const stored = storedInnings(Array.from({ length: 6 }, () => ({ type: 'dot' })));
    expect(runs(seed())).toBe(0);

    const out = correctBall(
      seed(),
      stored,
      stored[2]!.id,
      patch({ eventType: '4', runsOffBat: 4 }),
      nameOf,
    );

    expect(runs(out.state)).toBe(4);
    // The edit plus the three deliveries after it.
    expect(out.rewritten).toHaveLength(4);
    expect(out.fromIndex).toBe(2);
  });

  it('moves the strike for every delivery after it, and says so', () => {
    /*
     * The case the whole feature exists for. Six dots means Arun faced all
     * six. Correcting the third to a single rotates the strike, so balls 4-6
     * were Bala's — and the scorer has to be told that before they trust the
     * card.
     */
    const stored = storedInnings(Array.from({ length: 6 }, () => ({ type: 'dot' })));
    for (const b of stored) expect(b.batsmanId).toBe(A);

    const out = correctBall(
      seed(),
      stored,
      stored[2]!.id,
      patch({ eventType: '1', runsOffBat: 1 }),
      nameOf,
    );

    // Ball 3 still Arun's — the single was struck before they crossed.
    expect(String(out.rewritten[0]!.batsmanId)).toBe(A);
    // Balls 4, 5, 6 are Bala's now.
    expect(out.rewritten.slice(1).map((b) => String(b.batsmanId))).toEqual([B, B, B]);

    const strike = out.changes.filter((c) => c.what === 'strike');
    expect(strike).toHaveLength(3);
    expect(strike[0]!.detail).toBe('faced by Bala, not Arun');
  });

  it('rotates the strike back at the end of the over, so the seventh ball is unaffected', () => {
    // Six dots plus one. The seventh delivery is a new over, and the strike
    // rotation at the over's end cancels the one the correction introduced.
    const stored = storedInnings([
      ...Array.from({ length: 6 }, () => ({ type: 'dot' })),
      { type: 'dot', bowler: BOWL2 },
    ]);
    expect(stored[6]!.batsmanId).toBe(B);

    const out = correctBall(
      seed(),
      stored,
      stored[2]!.id,
      patch({ eventType: '1', runsOffBat: 1 }),
      nameOf,
    );

    // Ball 7 is Arun's now rather than Bala's — one rotation, then the
    // over's own swap on top of it.
    expect(String(out.rewritten[4]!.batsmanId)).toBe(A);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Corrections that change the shape of the over
// ─────────────────────────────────────────────────────────────────────────────

describe('a delivery that becomes illegal', () => {
  it('pushes the rest of the over along and reports the move', () => {
    // Five dots. Correcting the second to a wide means the over now needs a
    // sixth legal delivery it does not have — the innings simply has one
    // fewer legal ball, which is correct and not an error.
    const stored = storedInnings(Array.from({ length: 5 }, () => ({ type: 'dot' })));

    const out = correctBall(
      seed(),
      stored,
      stored[1]!.id,
      patch({ eventType: 'wide', extraRuns: 1 }),
      nameOf,
    );

    expect(runs(out.state)).toBe(1);
    expect(out.state.currentInnings.extras).toBe(1);
    // Five deliveries, one of them illegal → four legal balls bowled.
    expect(out.state.currentInnings.ballsBowled).toBe(4);
  });

  it('refuses when it would move a delivery into the next bowler’s over', () => {
    /*
     * Six dots from Imran, then Rahul starts the next over. Correcting one of
     * the six to a wide means the sixth is no longer the last of the over, so
     * Rahul's first delivery now falls *inside* Imran's over — a bowler
     * changing mid-over, which Law 17.4 refuses.
     *
     * There is no honest way to absorb that, so it is refused. What matters
     * is that the refusal names the delivery.
     */
    const stored = storedInnings([
      ...Array.from({ length: 6 }, () => ({ type: 'dot' })),
      { type: 'dot', bowler: BOWL2 },
    ]);

    let thrown: unknown;
    try {
      correctBall(
        seed(),
        stored,
        stored[0]!.id,
        patch({ eventType: 'wide', extraRuns: 1 }),
        nameOf,
      );
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(BallCorrectionError);
    const err = thrown as BallCorrectionError;
    expect(err.ballNumber).toBe(7);
    expect(err.message).toContain('makes ball 7 impossible');
    // Actionable, not just a refusal.
    expect(err.message).toContain('undo back to it');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The bowler
// ─────────────────────────────────────────────────────────────────────────────

describe('correcting the bowler', () => {
  it('corrects the whole over, not the single delivery', () => {
    /*
     * "Rahul bowled that over, not Imran" is what a scorer means. Applying it
     * to one delivery would leave the other five with Imran and the engine
     * objecting that the bowler changed mid-over — a refusal manufactured
     * entirely by taking the request too literally.
     */
    const stored = storedInnings(Array.from({ length: 4 }, () => ({ type: 'dot' })));

    const out = correctBall(seed(), stored, stored[0]!.id, patch({ bowlerId: BOWL2 }), nameOf);

    expect(out.rewritten.map((b) => String(b.bowlerId))).toEqual([BOWL2, BOWL2, BOWL2, BOWL2]);
    expect(out.state.bowling[BOWL1]).toBeUndefined();
    expect(out.state.bowling[BOWL2]!.balls).toBe(4);

    const bowlerChanges = out.changes.filter((c) => c.what === 'bowler');
    expect(bowlerChanges).toHaveLength(4);
    expect(bowlerChanges[0]!.detail).toBe('bowled by Rahul, not Imran');
  });

  it('stops at the over boundary, and refuses if that makes the next over unlawful', () => {
    /*
     * The cascade is bounded to the over on purpose, and this is the case
     * that proves it is not silently widened. Imran bowls the first over and
     * Rahul the second. Correcting the first over to Rahul leaves Rahul with
     * both — two consecutive overs, which Law 16.2 refuses.
     *
     * Quietly reassigning the second over as well would "fix" this and would
     * be a scorer's worst outcome: an over credited to a bowler nobody said
     * bowled it. Refusing, and naming the delivery, is the honest answer.
     */
    const stored = storedInnings([
      ...Array.from({ length: 6 }, () => ({ type: 'dot' })),
      { type: 'dot', bowler: BOWL2 },
    ]);

    let thrown: unknown;
    try {
      correctBall(seed(), stored, stored[0]!.id, patch({ bowlerId: BOWL2 }), nameOf);
    } catch (e) {
      thrown = e;
    }

    const err = thrown as BallCorrectionError;
    expect(err).toBeInstanceOf(BallCorrectionError);
    expect(err.ballNumber).toBe(7);
    expect(err.code).toBe('BOWLER_BOWLED_CONSECUTIVE_OVERS');
    expect(err.message).toContain('two consecutive overs');
  });

  it('leaves a later over alone when doing so is lawful', () => {
    // Same shape, but the second over belongs to a third bowler, so
    // correcting the first over touches nothing after it.
    const stored = storedInnings([
      ...Array.from({ length: 6 }, () => ({ type: 'dot' })),
      { type: 'dot', bowler: BOWL2 },
    ]);

    const out = correctBall(seed(), stored, stored[0]!.id, patch({ bowlerId: C }), nameOf);

    expect(out.rewritten.slice(0, 6).map((b) => String(b.bowlerId))).toEqual(Array(6).fill(C));
    // The seventh keeps the bowler it was recorded with.
    expect(String(out.rewritten[6]!.bowlerId)).toBe(BOWL2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wickets
// ─────────────────────────────────────────────────────────────────────────────

describe('a wicket that never happened', () => {
  it('puts the dismissed batter back and removes the one who walked in', () => {
    /*
     * Arun is bowled on the second delivery and Chetan comes in. The scorer
     * then realises it was a bye, not a wicket.
     *
     * Chetan never batted. Every run credited to him belongs to Arun. That
     * looks drastic and is exactly what "that was not a wicket" means — so
     * the change list has to say it out loud.
     */
    const stored = storedInnings([
      { type: 'dot' },
      { type: 'wicket', wicket: 'bowled', out: A },
      { type: '1', runs: 1, inAt: { striker: C } },
      { type: 'dot' },
    ]);
    expect(stored[2]!.batsmanId).toBe(C);

    const out = correctBall(
      seed(),
      stored,
      stored[1]!.id,
      patch({ eventType: 'bye', extraRuns: 1 }),
      nameOf,
    );

    expect(out.state.currentInnings.wickets).toBe(0);
    expect(out.state.batting[C]).toBeUndefined();
    expect(out.state.batting[A]!.isOut).toBe(false);

    const removed = out.changes.find((c) => c.what === 'removed_batter');
    expect(removed?.detail).toBe('Chetan no longer bats in this innings');

    const wicket = out.changes.find((c) => c.what === 'wicket');
    expect(wicket?.detail).toBe('no longer a wicket');
  });

  it('keeps the batter the scorer sent in when the wicket survives the edit', () => {
    // Correcting the *runs* on a wicket delivery must not disturb who walked
    // in — that is the one thing on the next delivery the engine cannot
    // derive and the scorer genuinely asserted.
    const stored = storedInnings([
      { type: 'dot' },
      { type: 'wicket', wicket: 'caught', out: A, fielder: BOWL2 },
      { type: 'dot', inAt: { striker: C } },
    ]);

    const out = correctBall(
      seed(),
      stored,
      stored[1]!.id,
      patch({ eventType: 'wicket', wicketType: 'bowled', wicketPlayerId: A }),
      nameOf,
    );

    expect(String(out.rewritten[1]!.batsmanId)).toBe(C);
    expect(out.state.batting[A]!.dismissalType).toBe('bowled');
  });

  it('follows the end, not the person, when the strike has moved', () => {
    /*
     * A run-out is recorded against the non-striker. If an earlier correction
     * swapped the ends, following the *person* would credit the dismissal to
     * whoever is now at the other end. What the scorer observed was an end.
     */
    const stored = storedInnings([
      { type: 'dot' },
      { type: 'dot' },
      { type: 'wicket', wicket: 'run_out', out: B, fielder: BOWL2 },
    ]);
    expect(stored[2]!.wicketPlayerId).toBe(B);
    expect(stored[2]!.nonStrikerId).toBe(B);

    const out = correctBall(
      seed(),
      stored,
      stored[0]!.id,
      patch({ eventType: '1', runsOffBat: 1 }),
      nameOf,
    );

    // Arun and Bala have swapped, so the non-striker's end is now Arun's —
    // and the run-out follows the end.
    const wicketBall = out.rewritten[out.rewritten.length - 1]!;
    expect(String(wicketBall.nonStrikerId)).toBe(A);
    expect(String(wicketBall.wicketPlayerId)).toBe(A);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Asserted batters
// ─────────────────────────────────────────────────────────────────────────────

describe('naming the batters explicitly', () => {
  it('accepts the correction when the wrong batter was sent in', () => {
    // The one case the server cannot derive: a wicket fell and the scorer
    // tapped the wrong name on the way in.
    const stored = storedInnings([
      { type: 'wicket', wicket: 'bowled', out: A },
      { type: 'dot', inAt: { striker: C } },
      { type: 'dot' },
    ]);

    const out = correctBall(
      seed(),
      stored,
      stored[1]!.id,
      patch({ batsmanId: BOWL2, nonStrikerId: B }),
      nameOf,
    );

    expect(String(out.rewritten[0]!.batsmanId)).toBe(BOWL2);
    // …and Chetan, who never actually batted, is gone from the innings.
    expect(out.state.batting[C]).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Refusals
// ─────────────────────────────────────────────────────────────────────────────

describe('refusing', () => {
  it('rejects a delivery that is not in the innings', () => {
    const stored = storedInnings([{ type: 'dot' }]);
    expect(() => correctBall(seed(), stored, 'no-such-ball', patch(), nameOf)).toThrow(
      BallCorrectionError,
    );
  });

  it('rejects an edit the rules refuse on its own terms', () => {
    // A wicket credited to a fielder who is one of the two batters.
    const stored = storedInnings([{ type: 'dot' }, { type: 'dot' }]);

    let thrown: unknown;
    try {
      correctBall(
        seed(),
        stored,
        stored[0]!.id,
        patch({ eventType: 'wicket', wicketType: 'caught', wicketPlayerId: A, fielderId: B }),
        nameOf,
      );
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(BallCorrectionError);
    // The edit itself, so no "makes ball N impossible" framing.
    expect((thrown as BallCorrectionError).message).not.toContain('impossible');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Not changing what was not asked for
// ─────────────────────────────────────────────────────────────────────────────

describe('a correction that changes nothing', () => {
  it('reports no consequences when the delivery is rewritten identically', () => {
    const stored = storedInnings([{ type: '1', runs: 1 }, { type: 'dot' }, { type: 'dot' }]);

    const out = correctBall(
      seed(),
      stored,
      stored[0]!.id,
      patch({ eventType: '1', runsOffBat: 1 }),
      nameOf,
    );

    expect(out.changes).toEqual([]);
    expect(runs(out.state)).toBe(1);
    expect(out.rewritten.map((b) => String(b.batsmanId))).toEqual([A, B, B]);
  });
});
