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
import { sizeMaxWickets, sizeBowlerQuota, resolvePlayingXI } from './matches';

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

/**
 * Which eleven the innings is sized from.
 *
 * The wizard has had a "Pick the XI" step since it was written and what it
 * picked was never sent: `createMatchWithFirstInnings` read `getTeamMembers()`
 * — the club's whole registered roster — for both sides. Both functions above
 * were then handed the wrong number.
 *
 * The cap at ten hid it for eleven-a-side, which is why it survived. It does
 * not hide it for the formats this app exists for: a seven-a-side game played
 * out of a twelve-player roster was given ten wickets, so the innings could
 * not end the way the match was actually played.
 */
describe('resolving the XI out of the roster', () => {
  const roster = [
    { id: 'a' },
    { id: 'b' },
    { id: 'c' },
    { id: 'd' },
    { id: 'e' },
    { id: 'f' },
    { id: 'g' },
    { id: 'h' },
    { id: 'i' },
    { id: 'j' },
    { id: 'k' },
    { id: 'l' },
  ];

  it('takes only the players named', () => {
    expect(resolvePlayingXI(['a', 'c', 'e'], roster)).toEqual([
      { id: 'a' },
      { id: 'c' },
      { id: 'e' },
    ]);
  });

  it('reads "nobody said" as the whole roster', () => {
    // The compatibility contract from migration 0018. Undefined is not an
    // empty side — it is a match created before an XI could be recorded, and
    // it has to replay exactly as it was scored.
    expect(resolvePlayingXI(undefined, roster)).toEqual(roster);
  });

  it('keeps roster order, not the order the ids arrived in', () => {
    // Batting order is stored on match_squads and read back from there. If
    // this took the client's order too, the two would answer differently.
    expect(resolvePlayingXI(['e', 'a'], roster).map((p) => p.id)).toEqual(['a', 'e']);
  });

  it('ignores an id that is not on the club’s books', () => {
    // `assertSquadInRoster` rejects this before it reaches here, so this is
    // the second line rather than the first: a stranger's id cannot become a
    // member of the side by being named.
    expect(resolvePlayingXI(['a', 'not-a-member'], roster)).toEqual([{ id: 'a' }]);
  });

  it('sizes a seven-a-side innings for seven, not for the twelve on the books', () => {
    // The bug, stated as an assertion. Six wickets ends the innings; ten
    // never arrives, because there are only seven players to lose.
    const xi = resolvePlayingXI(['a', 'b', 'c', 'd', 'e', 'f', 'g'], roster);
    expect(sizeMaxWickets(xi.length)).toBe(6);
    expect(sizeMaxWickets(roster.length)).toBe(10);
  });

  it('sizes the bowling quota from the side, not the roster', () => {
    // Four bowlers cannot cover twenty overs at four each, so the standard
    // quota does not apply and the match runs unlimited. Counting all twelve
    // registered players says it does — and the engine would then refuse a
    // fifth over the side had no choice but to bowl.
    const xi = resolvePlayingXI(['a', 'b', 'c', 'd'], roster);
    expect(sizeBowlerQuota(undefined, 20, xi.length)).toBeNull();
    expect(sizeBowlerQuota(undefined, 20, roster.length)).toBe(4);
  });
});
