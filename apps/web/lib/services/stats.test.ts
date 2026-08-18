/**
 * Career figures, folded from per-innings rows.
 *
 * The arithmetic a player argues about in the bar: the asterisk on a high
 * score, which of two three-fors was better, and when the fifty happened.
 * All pure, and all previously reachable only through a database.
 */
import { describe, it, expect } from 'vitest';
import { foldBatting, foldBowling, ordinal, milestonesFor, seasonOf } from './stats';

const day = (n: number) => new Date(2026, 0, n);

const bat = (runs: number, isOut: boolean, over: Record<string, unknown> = {}) => ({
  inningsId: `i${runs}-${isOut}`,
  matchId: `m${runs}-${isOut}`,
  playedAt: day(1),
  opponent: null,
  runs,
  balls: Math.max(runs, 1),
  fours: 0,
  sixes: 0,
  isOut,
  ...over,
});

const bowl = (wickets: number, runs: number, over: Record<string, unknown> = {}) => ({
  inningsId: `i${wickets}-${runs}`,
  matchId: `m${wickets}-${runs}`,
  playedAt: day(1),
  opponent: null,
  balls: 24,
  runs,
  wickets,
  ...over,
});

describe('foldBatting', () => {
  it('averages over dismissals, not innings', () => {
    // 100 runs, out twice in three innings, so 50 rather than 33.3.
    const c = foldBatting([bat(60, true), bat(30, true), bat(10, false)]);
    expect(c.runs).toBe(100);
    expect(c.innings).toBe(3);
    expect(c.notOuts).toBe(1);
    expect(c.average).toBe(50);
  });

  it('has no average at all until the first dismissal', () => {
    // Not zero, not Infinity. An average needs a denominator.
    const c = foldBatting([bat(40, false), bat(12, false)]);
    expect(c.average).toBeNull();
    expect(c.strikeRate).not.toBeNull();
  });

  it('gives the asterisk to an unbeaten innings of equal size', () => {
    // 84 and 84 not out. Convention says the unbeaten one is the better knock.
    const c = foldBatting([bat(84, true), bat(84, false)]);
    expect(c.highScore).toBe(84);
    expect(c.highScoreNotOut).toBe(true);
  });

  it('does not give the asterisk to a smaller unbeaten score', () => {
    const c = foldBatting([bat(84, true), bat(20, false)]);
    expect(c.highScore).toBe(84);
    expect(c.highScoreNotOut).toBe(false);
  });

  it('does not count a hundred as a fifty as well', () => {
    const c = foldBatting([bat(50, true), bat(99, true), bat(100, true), bat(150, true)]);
    expect(c.fifties).toBe(2);
    expect(c.hundreds).toBe(2);
  });

  it('folds an empty career without dividing by anything', () => {
    const c = foldBatting([]);
    expect(c.innings).toBe(0);
    expect(c.runs).toBe(0);
    expect(c.average).toBeNull();
    expect(c.strikeRate).toBeNull();
  });
});

describe('foldBowling', () => {
  it('ranks best figures on wickets first, then fewest runs', () => {
    // Five beats four on wickets; 5-20 beats 5-31 on runs conceded.
    const c = foldBowling([bowl(4, 10), bowl(5, 31), bowl(5, 20)]);
    expect(c.bestWickets).toBe(5);
    expect(c.bestRuns).toBe(20);
  });

  it('does not treat a wicketless spell as a best figure', () => {
    /*
     * The trap here: 0-12 arriving first would set bestRuns to 12 if the
     * tie-break ran on runs alone, and then 0-8 would "beat" it. Neither is a
     * bowling performance, and the `wickets > 0` clause is what stops it.
     */
    const c = foldBowling([bowl(0, 12), bowl(0, 8), bowl(1, 40)]);
    expect(c.bestWickets).toBe(1);
    expect(c.bestRuns).toBe(40);
  });

  it('has no average or strike rate while wicketless, but still an economy', () => {
    // Economy needs balls; the other two need a wicket. They diverge here.
    const c = foldBowling([bowl(0, 30)]);
    expect(c.average).toBeNull();
    expect(c.strikeRate).toBeNull();
    expect(c.economy).toBeCloseTo(7.5);
  });

  it('counts a five-for, and not a four-for', () => {
    expect(foldBowling([bowl(4, 20), bowl(5, 60), bowl(6, 10)]).fiveFors).toBe(2);
  });
});

describe('ordinal', () => {
  it('says the first ten in words', () => {
    expect(ordinal(1)).toBe('First');
    expect(ordinal(10)).toBe('Tenth');
  });

  it('switches to numerals past ten', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(23)).toBe('23rd');
    expect(ordinal(24)).toBe('24th');
  });

  it('gets the teens right, which are the exception', () => {
    // 11, 12 and 13 take "th" despite ending 1, 2, 3 — and 111 through 113
    // repeat the exception a digit up.
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(111)).toBe('111th');
    expect(ordinal(112)).toBe('112th');
    expect(ordinal(113)).toBe('113th');
    expect(ordinal(121)).toBe('121st');
  });
});

describe('milestonesFor', () => {
  it('counts how long ago in appearances, not in days', () => {
    /*
     * The point of the whole function: "eighth fifty, two matches ago" says a
     * player is in form. "8 fifties" says only that they have been around.
     */
    const rows = [
      bat(50, true, { matchId: 'a', playedAt: day(1) }),
      bat(10, true, { matchId: 'b', playedAt: day(2) }),
      bat(20, true, { matchId: 'c', playedAt: day(3) }),
    ];
    const [fifty] = milestonesFor(rows, []);
    expect(fifty?.label).toBe('First fifty');
    expect(fifty?.matchesAgo).toBe(2);
  });

  it('keeps only the most recent of each kind', () => {
    const rows = [
      bat(50, true, { matchId: 'a', playedAt: day(1) }),
      bat(60, true, { matchId: 'b', playedAt: day(2) }),
    ];
    const found = milestonesFor(rows, []);
    expect(found.filter((m) => m.label.includes('fifty'))).toHaveLength(1);
    expect(found[0]?.label).toBe('Second fifty');
    expect(found[0]?.matchesAgo).toBe(0);
  });

  it('does not count a century as a fifty', () => {
    const rows = [bat(120, true, { matchId: 'a', playedAt: day(1) })];
    const labels = milestonesFor(rows, []).map((m) => m.label);
    expect(labels).toContain('First century');
    expect(labels).not.toContain('First fifty');
  });

  it('records a thousand runs against the innings that crossed it', () => {
    const rows = [
      bat(900, true, { matchId: 'a', playedAt: day(1) }),
      bat(150, true, { matchId: 'b', playedAt: day(2) }),
      bat(10, true, { matchId: 'c', playedAt: day(3) }),
    ];
    const runs = milestonesFor(rows, []).find((m) => m.label.includes('career runs'));
    expect(runs?.label).toBe('1000 career runs');
    // Crossed in match b, which is one appearance back.
    expect(runs?.matchesAgo).toBe(1);
  });

  it('orders newest first', () => {
    const rows = [
      bat(50, true, { matchId: 'a', playedAt: day(1) }),
      bat(100, true, { matchId: 'b', playedAt: day(2) }),
    ];
    const ago = milestonesFor(rows, []).map((m) => m.matchesAgo);
    expect(ago).toEqual([...ago].sort((x, y) => x - y));
  });

  it('says nothing about a player who has done nothing notable', () => {
    expect(milestonesFor([bat(12, true)], [])).toEqual([]);
    expect(milestonesFor([], [])).toEqual([]);
  });

  it('counts a five-for as a milestone', () => {
    const found = milestonesFor([], [bowl(5, 20, { matchId: 'a', playedAt: day(1) })]);
    expect(found.map((m) => m.label)).toContain('First five-for');
  });
});

describe('seasonOf', () => {
  it('is the calendar year, because Indian club cricket does not split one', () => {
    expect(seasonOf(new Date(2026, 0, 1))).toBe(2026);
    expect(seasonOf(new Date(2026, 11, 31))).toBe(2026);
  });
});
