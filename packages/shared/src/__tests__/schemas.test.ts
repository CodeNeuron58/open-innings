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
