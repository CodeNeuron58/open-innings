/**
 * Who won, and by how much.
 *
 * `computeMatchResult` decides the single most consequential fact a match
 * produces, and it had no test. It also runs in two places — the ball
 * endpoint when a chase completes, and `endCurrentInnings` when a short squad
 * closes an innings early — so a mistake here reaches both.
 *
 * The chase innings always carries `target` = first-innings runs + 1, which
 * makes `target - 1` the score to beat. Every case below is stated in those
 * terms rather than in the raw numbers, because that is the invariant the
 * function actually rests on.
 */
import { describe, it, expect } from 'vitest';
import { computeMatchResult, formatMatchResult } from './match-result';

const chase = (over: Partial<Parameters<typeof computeMatchResult>[0]> = {}) => ({
  runs: 0,
  wickets: 0,
  target: 151, // they are chasing 150
  maxWickets: 10,
  battingTeamId: 'chasing',
  bowlingTeamId: 'defending',
  ...over,
});

describe('computeMatchResult', () => {
  it('the chasing side wins by the wickets still standing', () => {
    const r = computeMatchResult(chase({ runs: 151, wickets: 6 }));
    expect(r.winningTeamId).toBe('chasing');
    expect(r.marginWickets).toBe(4);
    expect(r.marginRuns).toBeUndefined();
  });

  it('passing the target by more than one run is still the same margin', () => {
    // Margin is wickets, not runs — overtaking by 20 does not widen it.
    expect(computeMatchResult(chase({ runs: 171, wickets: 6 })).marginWickets).toBe(4);
  });

  it('an unbeaten chase is a ten-wicket win', () => {
    expect(computeMatchResult(chase({ runs: 151, wickets: 0 })).marginWickets).toBe(10);
  });

  it('level scores are a tie, and nobody wins', () => {
    // target - 1 is the score to match. Reaching exactly it is a tie.
    const r = computeMatchResult(chase({ runs: 150, wickets: 8 }));
    expect(r.winningTeamId).toBeNull();
    expect(r.marginRuns).toBeUndefined();
    expect(r.marginWickets).toBeUndefined();
  });

  it('one short is a one-run defeat, not a tie', () => {
    // The boundary either side of a tie is where an off-by-one would hide.
    const r = computeMatchResult(chase({ runs: 149, wickets: 10 }));
    expect(r.winningTeamId).toBe('defending');
    expect(r.marginRuns).toBe(1);
  });

  it('the defending side wins by the runs left in it', () => {
    const r = computeMatchResult(chase({ runs: 130, wickets: 10 }));
    expect(r.winningTeamId).toBe('defending');
    expect(r.marginRuns).toBe(20);
    expect(r.marginWickets).toBeUndefined();
  });

  it('a super over is judged on its own two wickets', () => {
    const r = computeMatchResult(chase({ runs: 16, target: 16, maxWickets: 2, wickets: 1 }));
    expect(r.winningTeamId).toBe('chasing');
    expect(r.marginWickets).toBe(1);
  });

  it('never reports a margin of zero wickets', () => {
    /*
     * Defensive, and worth pinning. A side cannot pass the target having lost
     * every wicket — the innings ends first — so this should be unreachable.
     * But "won by 0 wickets" is the kind of thing that reaches a share card
     * before anyone notices, and the clamp is the only thing stopping it.
     */
    const r = computeMatchResult(chase({ runs: 151, wickets: 10 }));
    expect(r.marginWickets).toBe(1);
  });
});

describe('formatMatchResult', () => {
  it('pluralises both margins', () => {
    expect(formatMatchResult({ winningTeamId: 't', marginWickets: 1 }, 'Belonia')).toBe(
      'Belonia won by 1 wicket',
    );
    expect(formatMatchResult({ winningTeamId: 't', marginWickets: 4 }, 'Belonia')).toBe(
      'Belonia won by 4 wickets',
    );
    expect(formatMatchResult({ winningTeamId: 't', marginRuns: 1 }, 'Belonia')).toBe(
      'Belonia won by 1 run',
    );
    expect(formatMatchResult({ winningTeamId: 't', marginRuns: 20 }, 'Belonia')).toBe(
      'Belonia won by 20 runs',
    );
  });

  it('says a tie without naming anyone', () => {
    expect(formatMatchResult({ winningTeamId: null }, 'Belonia')).toBe('Match tied');
    expect(formatMatchResult({ winningTeamId: null }, undefined)).toBe('Match tied');
  });

  it('falls back to a placeholder when the team lookup failed', () => {
    // getTeam is called with .catch(() => null) at both call sites, so a
    // missing name is reachable and must not render "undefined won by...".
    expect(formatMatchResult({ winningTeamId: 't', marginRuns: 5 }, null)).toBe(
      'Winner won by 5 runs',
    );
  });

  it('formats super over wins and ties cleanly without margin numbers', () => {
    expect(
      formatMatchResult({ winningTeamId: 't', marginRuns: 4 }, 'Belonia', { superOver: true }),
    ).toBe('Belonia won the Super Over');
    expect(
      formatMatchResult({ winningTeamId: 't', marginWickets: 1 }, 'Belonia', { superOver: true }),
    ).toBe('Belonia won the Super Over');
    expect(formatMatchResult({ winningTeamId: null }, 'Belonia', { superOver: true })).toBe(
      'Super Over tied',
    );
  });
});
