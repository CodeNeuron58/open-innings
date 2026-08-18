/**
 * The display helpers, which turn engine numbers into what a scorer reads.
 *
 * Small, and worth pinning: an over is base-six, so every one of these is a
 * place where a plain division would look right and be wrong.
 */
import { describe, it, expect } from 'vitest';
import { formatOvers, formatStrikeRate, formatEconomy } from './utils';

describe('formatOvers', () => {
  it('counts in sixes, not tenths', () => {
    expect(formatOvers(0)).toBe('0.0');
    expect(formatOvers(1)).toBe('0.1');
    expect(formatOvers(5)).toBe('0.5');
    // The rollover. 6 balls is one whole over, never "0.6".
    expect(formatOvers(6)).toBe('1.0');
    expect(formatOvers(7)).toBe('1.1');
    expect(formatOvers(11)).toBe('1.5');
    expect(formatOvers(12)).toBe('2.0');
  });

  it('handles a full innings', () => {
    expect(formatOvers(120)).toBe('20.0');
    expect(formatOvers(119)).toBe('19.5');
    expect(formatOvers(300)).toBe('50.0');
  });
});

describe('formatStrikeRate', () => {
  it('is runs per hundred balls, to two places', () => {
    expect(formatStrikeRate(50, 50)).toBe('100.00');
    expect(formatStrikeRate(100, 50)).toBe('200.00');
    expect(formatStrikeRate(25, 50)).toBe('50.00');
    expect(formatStrikeRate(1, 3)).toBe('33.33');
  });

  it('says nothing rather than zero for a batter who has not faced one', () => {
    /*
     * An em dash, not "0.00", and the distinction is the honest one: a batter
     * run out at the other end without facing a ball has no strike rate, and
     * printing 0.00 would claim they scored at nothing off something.
     */
    expect(formatStrikeRate(0, 0)).toBe('—');
  });
});

describe('formatEconomy', () => {
  it('is runs per over, so it divides by six', () => {
    expect(formatEconomy(24, 24)).toBe('6.00');
    expect(formatEconomy(30, 30)).toBe('6.00');
    // Half an over bowled, three runs off it → six an over.
    expect(formatEconomy(3, 3)).toBe('6.00');
    expect(formatEconomy(0, 6)).toBe('0.00');
  });

  it('says nothing rather than zero before a ball is bowled', () => {
    // Same reasoning as the strike rate: no deliveries means no economy, not
    // a perfect one.
    expect(formatEconomy(0, 0)).toBe('—');
  });
});
