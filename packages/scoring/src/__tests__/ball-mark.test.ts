/**
 * The scorebook mark for a delivery.
 *
 * There were three implementations of this — one here, one in the web chip and
 * one in the mobile chip — and they disagreed on three counts. The worst of
 * them reported the same delivery as two different scores depending on which
 * screen you were looking at. Both apps now call `ballMark`, and these are the
 * cases that were wrong, pinned so a fourth copy has something to fail against.
 */
import { describe, it, expect } from 'vitest';
import { ballMark } from '../scorecard';

const mark = (o: {
  eventType: string;
  runsOffBat?: number;
  totalRuns: number;
  wicketType?: string | null;
}) => ballMark({ runsOffBat: 0, ...o });

describe('ballMark', () => {
  it('writes what the batting side got, overthrows included', () => {
    // The divergence: this read `2` on the phone and `6` on the web.
    expect(mark({ eventType: '2', runsOffBat: 2, totalRuns: 6 })).toEqual({
      label: '6',
      kind: 'run',
    });
  });

  it('reads a boundary off the bat, not off the total', () => {
    expect(mark({ eventType: '4', runsOffBat: 4, totalRuns: 4 }).kind).toBe('boundary');
    expect(mark({ eventType: '6', runsOffBat: 6, totalRuns: 6 }).kind).toBe('six');
    // Two run and four overthrown is six runs and no boundary.
    expect(mark({ eventType: '2', runsOffBat: 2, totalRuns: 6 }).kind).toBe('run');
  });

  it('counts a wide and a no-ball beyond their penalty', () => {
    expect(mark({ eventType: 'wide', totalRuns: 1 }).label).toBe('wd');
    // Was `3wd` on the web and `wd2` in the other two.
    expect(mark({ eventType: 'wide', totalRuns: 3 }).label).toBe('wd2');
    expect(mark({ eventType: 'no_ball', totalRuns: 1 }).label).toBe('nb');
    expect(mark({ eventType: 'no_ball', totalRuns: 3 }).label).toBe('nb2');
  });

  it('leads with the figure on byes, which carry no penalty', () => {
    // Was `b2` / `lb2` on the phone.
    expect(mark({ eventType: 'bye', totalRuns: 2 }).label).toBe('2b');
    expect(mark({ eventType: 'leg_bye', totalRuns: 2 }).label).toBe('2lb');
  });

  it('marks a penalty as an award', () => {
    expect(mark({ eventType: 'penalty', totalRuns: 5 })).toEqual({ label: '+5P', kind: 'penalty' });
  });

  it('lets a wicket outrank whatever the ball was otherwise worth', () => {
    expect(mark({ eventType: 'dot', totalRuns: 0, wicketType: 'bowled' }).label).toBe('W');
    // Run out coming back for the second.
    expect(mark({ eventType: '1', runsOffBat: 1, totalRuns: 1, wicketType: 'run_out' }).label).toBe(
      'W1',
    );
  });

  it('draws a dot as a dot', () => {
    expect(mark({ eventType: 'dot', totalRuns: 0 })).toEqual({ label: '•', kind: 'dot' });
  });

  it('gives every scoring shot its own kind, never the dot tone', () => {
    // The mobile chip's default branch drew 1s, 2s, 3s and 5s as dot balls.
    for (const runs of [1, 2, 3, 5]) {
      expect(mark({ eventType: String(runs), runsOffBat: runs, totalRuns: runs }).kind).toBe('run');
    }
  });
});
