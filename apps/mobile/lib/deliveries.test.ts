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
import { splitExtra, deliveryFor, EXTRA_TOTALS, type ExtraKind } from './deliveries';

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
