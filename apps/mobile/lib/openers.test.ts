/**
 * The rule three screens used to answer three different ways.
 *
 * The last assertion is the one that matters: the payload this builds is
 * parsed against `openersSchema` — the real thing the server validates with —
 * so a screen that composes something the server would refuse fails here
 * rather than in somebody's hand at an innings break.
 */
import { describe, it, expect } from 'vitest';
import { openersSchema } from '@open-innings/shared';
import { checkOpeners, openersPayload, type OpenersDraft } from './openers';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const draft = (over: Partial<OpenersDraft> = {}): OpenersDraft => ({
  strikerId: A,
  nonStrikerId: B,
  bowlerId: C,
  ...over,
});

describe('checkOpeners', () => {
  it('accepts a pair and a bowler', () => {
    expect(checkOpeners(draft())).toEqual({ ready: true, problem: null });
  });

  it('refuses an incomplete draft, and says so', () => {
    for (const missing of ['strikerId', 'nonStrikerId', 'bowlerId'] as const) {
      const result = checkOpeners(draft({ [missing]: null }));
      expect(result.ready, missing).toBe(false);
      expect(result.problem, missing).toMatch(/pick both/i);
    }
  });

  it('refuses the same person at both ends', () => {
    // The mistake this exists for. `OpenersSheet` prevented it by filtering the
    // striker out of the other list, `new.tsx` left it to the server, and
    // `InningsBreak` was the only one that told anybody.
    const result = checkOpeners(draft({ nonStrikerId: A }));
    expect(result.ready).toBe(false);
    expect(result.problem).toMatch(/different players/i);
  });

  it('names the incomplete draft first when both are wrong', () => {
    // Nothing chosen and the same name twice cannot both be the useful thing
    // to say, and "you have not finished" is the one that is actionable.
    expect(checkOpeners({ strikerId: A, nonStrikerId: A, bowlerId: null }).problem).toMatch(
      /pick both/i,
    );
  });

  it('lets a bowler open the batting for the other side', () => {
    // Not a mistake: the sides are different squads, and the same person
    // cannot be in both — that is the server's check, against the real squads,
    // not something this can know.
    expect(checkOpeners(draft({ bowlerId: A })).ready).toBe(true);
  });
});

describe('openersPayload', () => {
  it('builds what the API asks for', () => {
    expect(openersPayload(draft())).toEqual({
      openingStrikerId: A,
      openingNonStrikerId: B,
      openingBowlerId: C,
    });
  });

  it('returns null rather than a half-built payload', () => {
    // So a caller cannot compose something `checkOpeners` would have refused.
    expect(openersPayload(draft({ bowlerId: null }))).toBeNull();
    expect(openersPayload(draft({ nonStrikerId: A }))).toBeNull();
  });

  it('builds a payload the server accepts', () => {
    const payload = openersPayload(draft());
    expect(openersSchema.safeParse(payload).success).toBe(true);
  });

  it('never builds one the server refuses', () => {
    // Every draft that gets past the check has to parse. The pair rule is
    // stated in both places — here for the scorer, and in `openersSchema` for
    // the request — and this is what keeps them agreeing.
    const drafts: OpenersDraft[] = [
      draft(),
      draft({ bowlerId: A }),
      draft({ strikerId: B, nonStrikerId: A }),
    ];

    for (const d of drafts) {
      const payload = openersPayload(d);
      expect(payload, JSON.stringify(d)).not.toBeNull();
      expect(openersSchema.safeParse(payload).success, JSON.stringify(d)).toBe(true);
    }
  });
});
