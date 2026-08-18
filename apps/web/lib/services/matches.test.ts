/**
 * Sizing an innings to the side that is actually playing it.
 *
 * Both values used to be constants — ten wickets, and no bowling limit at all
 * — which is right for eleven-a-side and wrong for everything else this app
 * says it is for. Neither failure is visible while it is happening: a
 * six-a-side innings simply never ends, and one bowler quietly sends down all
 * twenty overs.
 */
import { describe, it, expect } from 'vitest';
import { sizeMaxWickets, sizeBowlerQuota } from './matches';

describe('how many wickets a side can lose', () => {
  it('is one fewer than the squad — the last batter has no partner', () => {
    expect(sizeMaxWickets(11)).toBe(10);
    expect(sizeMaxWickets(8)).toBe(7);
    expect(sizeMaxWickets(6)).toBe(5);
  });

  it('caps at ten however many players are registered', () => {
    // A club may name fifteen against a team. Only eleven bat.
    expect(sizeMaxWickets(15)).toBe(10);
  });

  it('never returns zero, so an innings can always start', () => {
    expect(sizeMaxWickets(1)).toBe(1);
    expect(sizeMaxWickets(0)).toBe(1);
  });
});

describe('the per-bowler over limit', () => {
  it('defaults to a fifth of the innings, rounded up', () => {
    expect(sizeBowlerQuota(undefined, 20, 11)).toBe(4);
    expect(sizeBowlerQuota(undefined, 50, 11)).toBe(10);
    expect(sizeBowlerQuota(undefined, 12, 11)).toBe(3);
  });

  it('takes an explicit number as given', () => {
    expect(sizeBowlerQuota(2, 20, 11)).toBe(2);
  });

  it('takes an explicit null as no limit', () => {
    // Gully and box cricket ignore the quota, and have to be able to.
    expect(sizeBowlerQuota(null, 20, 11)).toBeNull();
  });

  it('sets no limit when the side could not bowl the innings under it', () => {
    // Four players capped at one over each cannot bowl five, and a quota
    // nobody is left to satisfy would refuse every remaining delivery. The
    // deadlock is the reason this check exists.
    expect(sizeBowlerQuota(undefined, 5, 4)).toBeNull();
    expect(sizeBowlerQuota(undefined, 5, 5)).toBe(1);
  });

  it('respects an explicit limit even when it cannot be covered', () => {
    // Asked for on purpose is different from arrived at by default.
    expect(sizeBowlerQuota(1, 20, 3)).toBe(1);
  });
});
