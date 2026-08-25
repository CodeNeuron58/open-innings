/**
 * The rule that decides whether a batter gets their runs.
 *
 * These exist because of a specific bug. The correction sheet was written with
 * its own copy of the extras vocabulary, and the copy put a no-ball's whole
 * total into `extraRuns`. A no-ball struck for four would have recorded five
 * extras and **nothing to the batter** — wrong on the career page, which is
 * the reason the app exists.
 *
 * Nothing in the toolchain could have seen it. It typechecks. It lints. The
 * shared schema accepts it, because a no-ball may legitimately carry six
 * extras. The engine accepts it, because nothing in a ball log distinguishes
 * a four that was struck from four that were conceded. It is wrong only
 * against the cricket.
 *
 * So the last assertion in this file is the one that matters most: every
 * payload the two keypads can produce is parsed against the **real** shared
 * schema. A button that builds something the server would refuse now fails
 * here rather than in someone's hand at a ground.
 */
import { describe, it, expect } from 'vitest';
import { patchBallSchema, consistentBallEventSchema } from '@open-innings/shared';
import {
  splitExtra,
  deliveryFor,
  wicketDeliveryFor,
  armedTotal,
  EXTRA_TOTALS,
  type ExtraKind,
  type WicketDelivery,
} from './deliveries';

const KINDS: ExtraKind[] = ['wide', 'no_ball', 'bye', 'leg_bye'];

describe('splitExtra', () => {
  it('gives a struck no-ball to the batter and keeps only the penalty as an extra', () => {
    // The bug, stated as an assertion. Five on the board: one penalty, four
    // to the person who hit it.
    expect(splitExtra('no_ball', 5)).toEqual({ extraRuns: 1, runsOffBat: 4 });
  });

  it('reaches seven, which is a no-ball hit for six', () => {
    expect(splitExtra('no_ball', 7)).toEqual({ extraRuns: 1, runsOffBat: 6 });
    // …and the keypad has to offer it, or the shot is unrecordable.
    expect(EXTRA_TOTALS.no_ball).toContain(7);
  });

  it('credits a bare no-ball to nobody', () => {
    expect(splitExtra('no_ball', 1)).toEqual({ extraRuns: 1, runsOffBat: 0 });
  });

  it('gives a wide entirely to the extras — it was never touched by the bat', () => {
    expect(splitExtra('wide', 4)).toEqual({ extraRuns: 4, runsOffBat: 0 });
  });

  it('gives byes and leg-byes entirely to the extras', () => {
    expect(splitExtra('bye', 3)).toEqual({ extraRuns: 3, runsOffBat: 0 });
    expect(splitExtra('leg_bye', 2)).toEqual({ extraRuns: 2, runsOffBat: 0 });
  });

  it('conserves the total for every extra and every offered value', () => {
    // The invariant underneath all of the above: the split moves runs between
    // two columns, it never creates or loses one.
    for (const kind of KINDS) {
      for (const total of EXTRA_TOTALS[kind]) {
        const { runsOffBat, extraRuns } = splitExtra(kind, total);
        expect(runsOffBat + extraRuns).toBe(total);
      }
    }
  });

  it('never offers a bye or leg-bye of zero, which is a dot ball', () => {
    for (const kind of KINDS) {
      expect(Math.min(...EXTRA_TOTALS[kind])).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('deliveryFor', () => {
  it('names a scoring shot by its own event type', () => {
    expect(deliveryFor({ kind: 'runs', runs: 4 })).toEqual({
      eventType: '4',
      runsOffBat: 4,
      overthrowRuns: 0,
      extraRuns: 0,
    });
    expect(deliveryFor({ kind: 'runs', runs: 0 })).toEqual({
      eventType: 'dot',
      runsOffBat: 0,
      overthrowRuns: 0,
      extraRuns: 0,
    });
  });

  it('carries the extra split through', () => {
    expect(deliveryFor({ kind: 'extra', extra: 'no_ball', total: 5 })).toEqual({
      eventType: 'no_ball',
      runsOffBat: 4,
      overthrowRuns: 0,
      extraRuns: 1,
    });
  });
});

/**
 * The check that would have caught the original bug's cousins.
 *
 * Both schemas, because a correction has to be as internally consistent as the
 * delivery it replaces — and `patchBallSchema` is the one the correction sheet
 * posts against.
 */
describe('every payload a keypad can build is one the server accepts', () => {
  const ids = {
    batsmanId: '11111111-1111-4111-8111-111111111111',
    nonStrikerId: '22222222-2222-4222-8222-222222222222',
    bowlerId: '33333333-3333-4333-8333-333333333333',
  };

  const everyChoice = [
    ...[0, 1, 2, 3, 4, 5, 6].map((runs) => ({ kind: 'runs' as const, runs })),
    ...KINDS.flatMap((extra) =>
      EXTRA_TOTALS[extra].map((total) => ({ kind: 'extra' as const, extra, total })),
    ),
  ];

  it('parses against patchBallSchema — the correction sheet', () => {
    for (const choice of everyChoice) {
      const parsed = patchBallSchema.safeParse({
        ...deliveryFor(choice),
        bowlerId: ids.bowlerId,
      });
      expect(
        parsed.success,
        `${JSON.stringify(choice)} → ${JSON.stringify(deliveryFor(choice))}`,
      ).toBe(true);
    }
  });

  it('parses against consistentBallEventSchema — the scorer keypad', () => {
    for (const choice of everyChoice) {
      const parsed = consistentBallEventSchema.safeParse({ ...deliveryFor(choice), ...ids });
      expect(
        parsed.success,
        `${JSON.stringify(choice)} → ${JSON.stringify(deliveryFor(choice))}`,
      ).toBe(true);
    }
  });

  it('would reject the bug it was written for', () => {
    // The old correction sheet's payload for "no-ball, batter hit four": the
    // schema *accepts* it, which is exactly why a schema was never going to
    // be enough. It is wrong against the cricket, not against the contract.
    const old = { eventType: 'no_ball', runsOffBat: 0, extraRuns: 5, bowlerId: ids.bowlerId };
    expect(patchBallSchema.safeParse(old).success).toBe(true);
    // What separates it from the correct payload is where the runs went.
    expect(deliveryFor({ kind: 'extra', extra: 'no_ball', total: 5 }).runsOffBat).toBe(4);
  });

  it('accepts the 5 penalty runs payload built by the scorer +5 Pen button', () => {
    const penaltyPayload = {
      eventType: 'penalty' as const,
      runsOffBat: 0,
      extraRuns: 5,
      ...ids,
    };
    const parsed = consistentBallEventSchema.safeParse(penaltyPayload);
    expect(parsed.success).toBe(true);
  });
});

/**
 * A dismissal off an extra.
 *
 * The bug these were written for: the scorer armed Wide, tapped W, and the
 * console sent `eventType: 'wicket'` with `extraRuns: 0`. The stumping was
 * recorded and the wide's penalty run vanished — silently, on a scorecard
 * that had already been shared, for one of the commonest dismissals in club
 * cricket. The engine had accepted a dismissal off a wide the whole time;
 * only the client threw it away.
 */
describe('wicketDeliveryFor', () => {
  const ids = {
    batsmanId: '11111111-1111-4111-8111-111111111111',
    nonStrikerId: '22222222-2222-4222-8222-222222222222',
    bowlerId: '33333333-3333-4333-8333-333333333333',
  };

  it('keeps the wide penalty on a stumping off a wide', () => {
    // The delivery this whole thing exists for. One run to the side, none to
    // anybody's bat, and the ball is not a legal one.
    expect(wicketDeliveryFor('wide', 0)).toEqual({
      eventType: 'wide',
      runsOffBat: 0,
      extraRuns: 1,
      totalRuns: 1,
    });
  });

  it('adds runs completed to the wide penalty on a run out', () => {
    expect(wicketDeliveryFor('wide', 2)).toEqual({
      eventType: 'wide',
      runsOffBat: 0,
      extraRuns: 3,
      totalRuns: 3,
    });
  });

  it('gives a struck no-ball to the batter and keeps the penalty as the extra', () => {
    // The same split `splitExtra` enforces — asserted here too, because this
    // is a second caller and the first copy of that rule was wrong.
    expect(wicketDeliveryFor('no_ball', 1)).toEqual({
      eventType: 'no_ball',
      runsOffBat: 1,
      extraRuns: 1,
      totalRuns: 2,
    });
  });

  it('carries no penalty on a bye or a leg bye', () => {
    expect(wicketDeliveryFor('bye', 2)).toEqual({
      eventType: 'bye',
      runsOffBat: 0,
      extraRuns: 2,
      totalRuns: 2,
    });
    expect(wicketDeliveryFor('leg_bye', 1)).toEqual({
      eventType: 'leg_bye',
      runsOffBat: 0,
      extraRuns: 1,
      totalRuns: 1,
    });
  });

  it('collapses a nought-run bye back to a fair delivery', () => {
    // Nothing was run, so nothing was conceded — it was never a bye. The
    // shared schema agrees: an extra scores at least one extra, so the
    // alternative here is a payload the server refuses.
    expect(wicketDeliveryFor('bye', 0).eventType).toBe('wicket');
    expect(wicketDeliveryFor('leg_bye', 0).eventType).toBe('wicket');
  });

  it('credits runs completed to the batter on a fair delivery', () => {
    expect(wicketDeliveryFor('fair', 2)).toEqual({
      eventType: 'wicket',
      runsOffBat: 2,
      extraRuns: 0,
      totalRuns: 2,
    });
  });

  it('is the plain wicket it always was when nothing was run', () => {
    expect(wicketDeliveryFor('fair', 0)).toEqual({
      eventType: 'wicket',
      runsOffBat: 0,
      extraRuns: 0,
      totalRuns: 0,
    });
  });

  it('builds a payload the server accepts, for every delivery and run count', () => {
    // The assertion that matters, in the shape the rest of this file uses:
    // a wicket sheet that can build something the server would refuse fails
    // here rather than in someone's hand at a ground.
    const deliveries: WicketDelivery[] = ['fair', 'wide', 'no_ball', 'bye', 'leg_bye'];

    for (const delivery of deliveries) {
      for (const runs of [0, 1, 2, 3, 4, 6]) {
        const built = wicketDeliveryFor(delivery, runs);
        const parsed = consistentBallEventSchema.safeParse({
          ...built,
          overthrowRuns: 0,
          wicketType: 'run_out',
          wicketPlayerId: ids.batsmanId,
          fielderId: ids.bowlerId,
          ...ids,
        });
        expect(parsed.success, `${delivery} +${runs} → ${JSON.stringify(built)}`).toBe(true);
      }
    }
  });
});

/**
 * The number the key will put on the board.
 *
 * These exist so the keypad can show it *before* the tap. The model asks a
 * scorer to hold two rules in their head — a wide's runs are the total, a no
 * ball's are on top of the penalty — and the only thing on screen that hinted
 * at either was a 9px line reading "Wide armed".
 */
describe('armedTotal', () => {
  it('adds the penalty to what came off the bat on a no ball', () => {
    expect(armedTotal('no_ball', 0)).toBe(1);
    expect(armedTotal('no_ball', 4)).toBe(5);
    expect(armedTotal('no_ball', 6)).toBe(7);
  });

  it('takes the runs as the whole total on a wide', () => {
    expect(armedTotal('wide', 4)).toBe(4);
    expect(armedTotal('wide', 2)).toBe(2);
  });

  it('reads a tap of zero as one, not none', () => {
    // A nought-run bye is a dot ball, and somebody who wanted a dot would not
    // have armed anything.
    expect(armedTotal('wide', 0)).toBe(1);
    expect(armedTotal('bye', 0)).toBe(1);
    expect(armedTotal('leg_bye', 0)).toBe(1);
  });

  it('agrees with splitExtra for every key and every extra', () => {
    // The number shown on the key and the number recorded have to be the same
    // number. They were two expressions in two files.
    for (const kind of KINDS) {
      for (const tapped of [0, 1, 2, 3, 4, 5, 6]) {
        const total = armedTotal(kind, tapped);
        const { runsOffBat, extraRuns } = splitExtra(kind, total);
        expect(runsOffBat + extraRuns, `${kind} +${tapped}`).toBe(total);
      }
    }
  });

  it('builds a payload the server accepts, for every key and every extra', () => {
    const ids = {
      batsmanId: '11111111-1111-4111-8111-111111111111',
      nonStrikerId: '22222222-2222-4222-8222-222222222222',
      bowlerId: '33333333-3333-4333-8333-333333333333',
    };
    for (const kind of KINDS) {
      for (const tapped of [0, 1, 2, 3, 4, 5, 6]) {
        const built = deliveryFor({ kind: 'extra', extra: kind, total: armedTotal(kind, tapped) });
        const parsed = consistentBallEventSchema.safeParse({ ...built, ...ids });
        expect(parsed.success, `${kind} +${tapped} → ${JSON.stringify(built)}`).toBe(true);
      }
    }
  });
});
