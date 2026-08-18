/**
 * Tests for the API contract.
 *
 * These cover the rules that live *only* in the schema — the ones no other
 * layer re-checks, so a regression here ships silently. Cricket law is the
 * scoring engine's business and is tested there; this file is about shape,
 * coercion, and cross-field consistency.
 */
import { describe, it, expect } from 'vitest';
import {
  BALL_EVENT_TYPES,
  ballEventSchema,
  consistentBallEventSchema,
  emailSchema,
  createMatchSchema,
  createPlayerSchema,
  createTeamSchema,
  openersSchema,
  resolveBattingSides,
} from '../index';

const validMatch = {
  oversPerInnings: 20,
  teamAId: 'team-a',
  teamBId: 'team-b',
  openingStrikerId: 'p1',
  openingNonStrikerId: 'p2',
  openingBowlerId: 'p3',
};

describe('emailSchema', () => {
  it('trims and lowercases', () => {
    expect(emailSchema.parse('  Scorer@Club.LOCAL  ')).toBe('scorer@club.local');
  });

  it('accepts single-label hosts so dev seeds keep working', () => {
    expect(emailSchema.safeParse('scorer@localhost').success).toBe(true);
  });

  it('rejects input with no @ or with whitespace', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
    expect(emailSchema.safeParse('two words@example.com').success).toBe(false);
  });
});

describe('createMatchSchema', () => {
  it('accepts a minimal valid match', () => {
    expect(createMatchSchema.safeParse(validMatch).success).toBe(true);
  });

  it('coerces overs from a form string', () => {
    const parsed = createMatchSchema.parse({ ...validMatch, oversPerInnings: '20' });
    expect(parsed.oversPerInnings).toBe(20);
  });

  it('rejects a team playing itself', () => {
    const result = createMatchSchema.safeParse({ ...validMatch, teamBId: 'team-a' });
    expect(result.success).toBe(false);
  });

  it('rejects the same player opening at both ends', () => {
    const result = createMatchSchema.safeParse({ ...validMatch, openingNonStrikerId: 'p1' });
    expect(result.success).toBe(false);
  });

  it('rejects zero or fractional overs', () => {
    expect(createMatchSchema.safeParse({ ...validMatch, oversPerInnings: 0 }).success).toBe(false);
    expect(createMatchSchema.safeParse({ ...validMatch, oversPerInnings: 2.5 }).success).toBe(
      false,
    );
  });

  it('treats the toss as all-or-nothing', () => {
    // A winner with no decision would silently fall through to "team A bats",
    // which is how you put the wrong side in to bat.
    const winnerOnly = createMatchSchema.safeParse({ ...validMatch, tossWinnerTeamId: 'team-b' });
    expect(winnerOnly.success).toBe(false);

    const decisionOnly = createMatchSchema.safeParse({ ...validMatch, tossDecision: 'bowl' });
    expect(decisionOnly.success).toBe(false);

    const both = createMatchSchema.safeParse({
      ...validMatch,
      tossWinnerTeamId: 'team-b',
      tossDecision: 'bowl',
    });
    expect(both.success).toBe(true);
  });

  it('rejects a toss won by a team that is not playing', () => {
    const result = createMatchSchema.safeParse({
      ...validMatch,
      tossWinnerTeamId: 'team-c',
      tossDecision: 'bat',
    });
    expect(result.success).toBe(false);
  });
});

describe('optional text fields', () => {
  it('collapses blank strings to undefined so the column stores NULL', () => {
    const player = createPlayerSchema.parse({ fullName: 'A Player', shortName: '   ' });
    expect(player.shortName).toBeUndefined();

    const team = createTeamSchema.parse({ name: 'Club XI', homeGround: '' });
    expect(team.homeGround).toBeUndefined();
  });

  it('still requires the non-optional name', () => {
    expect(createPlayerSchema.safeParse({ fullName: '   ' }).success).toBe(false);
    expect(createTeamSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('openersSchema', () => {
  it('rejects a duplicated opener', () => {
    const result = openersSchema.safeParse({
      openingStrikerId: 'p1',
      openingNonStrikerId: 'p1',
      openingBowlerId: 'p3',
    });
    expect(result.success).toBe(false);
  });

  it('allows the bowler to share an id with a batter', () => {
    // Nonsensical in a real match, but it is the squad check's job to catch
    // it — not the schema's. Keep the layers honest about what they own.
    const result = openersSchema.safeParse({
      openingStrikerId: 'p1',
      openingNonStrikerId: 'p2',
      openingBowlerId: 'p1',
    });
    expect(result.success).toBe(true);
  });
});

describe('resolveBattingSides', () => {
  it('defaults to team A batting when no toss is recorded', () => {
    expect(resolveBattingSides('a', 'b', undefined, undefined)).toEqual({
      battingTeamId: 'a',
      bowlingTeamId: 'b',
    });
  });

  it('puts the toss winner in to bat when they choose to bat', () => {
    expect(resolveBattingSides('a', 'b', 'b', 'bat')).toEqual({
      battingTeamId: 'b',
      bowlingTeamId: 'a',
    });
  });

  it('puts the other side in when the toss winner bowls', () => {
    expect(resolveBattingSides('a', 'b', 'b', 'bowl')).toEqual({
      battingTeamId: 'a',
      bowlingTeamId: 'b',
    });
    expect(resolveBattingSides('a', 'b', 'a', 'bowl')).toEqual({
      battingTeamId: 'b',
      bowlingTeamId: 'a',
    });
  });

  it('ignores a half-recorded toss rather than guessing', () => {
    expect(resolveBattingSides('a', 'b', 'b', undefined)).toEqual({
      battingTeamId: 'a',
      bowlingTeamId: 'b',
    });
  });
});

describe('ballEventSchema', () => {
  /** A minimal, valid delivery. Spread over to vary one field at a time. */
  const delivery = {
    eventType: 'dot',
    runsOffBat: 0,
    extraRuns: 0,
    batsmanId: 'bat1',
    nonStrikerId: 'bat2',
    bowlerId: 'bowl1',
  };

  it('accepts five off the bat', () => {
    // The bug this schema was wired up for: `ball_event_type` had no '5'
    // while the keypad had a 5 key, so the delivery died at the database with
    // "Internal error" and the ball was lost.
    const parsed = ballEventSchema.safeParse({
      ...delivery,
      eventType: '5',
      runsOffBat: 5,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts every event type the engine knows', () => {
    for (const eventType of BALL_EVENT_TYPES) {
      expect(ballEventSchema.safeParse({ ...delivery, eventType }).success).toBe(true);
    }
  });

  it('rejects an event type that is not in the enum', () => {
    // The precise failure the raw cast allowed through to Postgres.
    expect(ballEventSchema.safeParse({ ...delivery, eventType: '7' }).success).toBe(false);
    expect(ballEventSchema.safeParse({ ...delivery, eventType: 'howzat' }).success).toBe(false);
  });

  it('strips the fields a client must not decide', () => {
    /*
     * These are the reason the endpoint parses rather than casts.
     *
     * `isFreeHit: false` on the ball after a no-ball would let a client
     * record a dismissal Law 21.18 forbids; `isLegalDelivery: false` would
     * stop the over ever advancing; and a `totalRuns` that disagrees with its
     * own parts would put any number on the board.
     */
    const parsed = ballEventSchema.parse({
      ...delivery,
      isFreeHit: false,
      isLegalDelivery: false,
      totalRuns: 999,
      id: 'client-chosen-id',
    });

    expect(parsed).not.toHaveProperty('isFreeHit');
    expect(parsed).not.toHaveProperty('isLegalDelivery');
    expect(parsed).not.toHaveProperty('totalRuns');
    expect(parsed).not.toHaveProperty('id');
  });

  it('bounds the runs off the bat', () => {
    expect(ballEventSchema.safeParse({ ...delivery, runsOffBat: 7 }).success).toBe(false);
    expect(ballEventSchema.safeParse({ ...delivery, runsOffBat: -1 }).success).toBe(false);
    // Not an integer. A smallint column would silently round it.
    expect(ballEventSchema.safeParse({ ...delivery, runsOffBat: 2.5 }).success).toBe(false);
  });

  it('requires the three players on the field', () => {
    for (const field of ['batsmanId', 'nonStrikerId', 'bowlerId'] as const) {
      const { [field]: _omitted, ...rest } = delivery;
      expect(ballEventSchema.safeParse(rest).success).toBe(false);
    }
  });
});

describe('consistentBallEventSchema', () => {
  const delivery = {
    eventType: 'dot',
    runsOffBat: 0,
    extraRuns: 0,
    batsmanId: 'bat1',
    nonStrikerId: 'bat2',
    bowlerId: 'bowl1',
  };
  const parse = (o: Record<string, unknown>) => consistentBallEventSchema.safeParse(o);

  it('refuses a number dressed up as something else', () => {
    // z.coerce.number() would have turned each of these into a real delivery
    // with a 200 back. Number(null)=0, Number(true)=1, Number([4])=4.
    for (const runsOffBat of [null, true, [], [4], '4']) {
      expect(parse({ ...delivery, eventType: '4', runsOffBat }).success).toBe(false);
    }
  });

  it('refuses runs that contradict the event type', () => {
    // Both of these persisted happily before, leaving the ball chip on the
    // card and the score on the board describing different deliveries.
    expect(parse({ ...delivery, eventType: 'wide', runsOffBat: 6, extraRuns: 1 }).success).toBe(
      false,
    );
    expect(parse({ ...delivery, eventType: '6', runsOffBat: 0 }).success).toBe(false);
    expect(parse({ ...delivery, eventType: '4', runsOffBat: 4, extraRuns: 3 }).success).toBe(false);
    expect(parse({ ...delivery, eventType: 'bye', runsOffBat: 2, extraRuns: 2 }).success).toBe(
      false,
    );
    // An extra that scored nothing is not an extra.
    expect(parse({ ...delivery, eventType: 'wide', runsOffBat: 0, extraRuns: 0 }).success).toBe(
      false,
    );
  });

  it('accepts the deliveries the app and the smoke scripts actually send', () => {
    const real = [
      { eventType: 'dot', runsOffBat: 0, extraRuns: 0 },
      { eventType: '5', runsOffBat: 5, extraRuns: 0 },
      { eventType: '6', runsOffBat: 6, extraRuns: 0 },
      // p1-smoke: a wide to the fence, and a no-ball struck for four.
      { eventType: 'wide', runsOffBat: 0, extraRuns: 4 },
      { eventType: 'no_ball', runsOffBat: 4, extraRuns: 1 },
      { eventType: 'leg_bye', runsOffBat: 0, extraRuns: 2 },
      // A run-out is allowed after any number of runs, so it is not constrained.
      { eventType: 'wicket', runsOffBat: 1, extraRuns: 0, wicketType: 'run_out' },
    ];
    for (const ball of real) {
      const result = parse({ ...delivery, ...ball });
      expect(result.success, `${ball.eventType} should parse`).toBe(true);
    }
  });
});
