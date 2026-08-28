/**
 * The wagon wheel's arithmetic.
 *
 * Worth testing precisely because a wrong answer here still looks like a wagon
 * wheel — shots land somewhere, the picture is plausible, and nobody can tell
 * from the drawing that every one of them is ninety degrees out. The database
 * defines the convention (`ball_events.shot_angle`), so these tests assert
 * against that definition rather than against whatever the code happens to do.
 */
import { describe, it, expect } from 'vitest';
import { placementFromTap, pointFor, lineFor, placementOf, toneFor, regionOf } from './wagon-wheel';

const SIZE = 200;
const R = 100;

describe('placementFromTap', () => {
  // 0 is straight down the ground, which on screen is up from the middle.
  it('reads straight as 0', () => {
    expect(placementFromTap(R, 0, SIZE)?.angle).toBe(0);
  });

  it('reads clockwise: right is 90, back is 180, left is 270', () => {
    expect(placementFromTap(SIZE, R, SIZE)?.angle).toBe(90);
    expect(placementFromTap(R, SIZE, SIZE)?.angle).toBe(180);
    expect(placementFromTap(0, R, SIZE)?.angle).toBe(270);
  });

  it('measures distance as a percentage of the way to the rope', () => {
    expect(placementFromTap(R, 0, SIZE)?.distance).toBe(100);
    expect(placementFromTap(R, R / 2, SIZE)?.distance).toBe(50);
  });

  /*
   * A tap on the stumps has no direction. Recording it as "straight, no
   * distance" would be a shot the batter never played, put there by where a
   * finger landed.
   */
  it('returns null for a tap in the middle', () => {
    expect(placementFromTap(R, R, SIZE)).toBeNull();
  });

  // Aiming at the rope overshoots it as often as not, and refusing the tap
  // would mean the six being recorded simply did not take.
  it('clamps past the rope rather than refusing', () => {
    const p = placementFromTap(R, -50, SIZE);
    expect(p?.distance).toBe(100);
    expect(p?.angle).toBe(0);
  });

  it('never returns an angle outside 0–359', () => {
    for (let x = 0; x <= SIZE; x += 7) {
      for (let y = 0; y <= SIZE; y += 7) {
        const p = placementFromTap(x, y, SIZE);
        if (!p) continue;
        expect(p.angle).toBeGreaterThanOrEqual(0);
        expect(p.angle).toBeLessThanOrEqual(359);
        expect(p.distance).toBeGreaterThanOrEqual(1);
        expect(p.distance).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('pointFor', () => {
  it('is the inverse of a tap', () => {
    for (const angle of [0, 45, 90, 137, 180, 271, 359]) {
      const p = pointFor({ angle, distance: 80 }, R);
      const back = placementFromTap(p.x, p.y, SIZE);
      expect(back?.angle).toBe(angle);
      expect(back?.distance).toBe(80);
    }
  });

  it('puts straight-for-100 at the top edge', () => {
    expect(pointFor({ angle: 0, distance: 100 }, R)).toEqual({ x: 100, y: 0 });
  });

  it('puts a zero distance in the middle', () => {
    expect(pointFor({ angle: 123, distance: 0 }, R)).toEqual({ x: 100, y: 100 });
  });
});

describe('lineFor', () => {
  it('spans from the middle to the point, and turns to match', () => {
    const line = lineFor({ angle: 90, distance: 100 }, R);
    // Square on the right: a full radius long, centred half way along it.
    expect(line.width).toBeCloseTo(100);
    expect(line.left).toBeCloseTo(100);
    expect(line.rotate).toBe('0deg');
  });

  it('turns a straight shot upright', () => {
    expect(lineFor({ angle: 0, distance: 100 }, R).rotate).toBe('-90deg');
  });

  it('is half the length at half the distance', () => {
    expect(lineFor({ angle: 40, distance: 50 }, R).width).toBeCloseTo(50);
  });
});

describe('placementOf', () => {
  it('reads a complete pair', () => {
    expect(placementOf({ shotAngle: 30, shotDistance: 60 })).toEqual({ angle: 30, distance: 60 });
  });

  // The pair is written together and constrained together, but a response is
  // still a response — half of one means nothing plottable.
  it('refuses a half-filled pair', () => {
    expect(placementOf({ shotAngle: 30, shotDistance: null })).toBeNull();
    expect(placementOf({ shotAngle: null, shotDistance: 60 })).toBeNull();
    expect(placementOf({})).toBeNull();
  });

  it('keeps a genuine zero, which is not the same as absent', () => {
    expect(placementOf({ shotAngle: 0, shotDistance: 0 })).toEqual({ angle: 0, distance: 0 });
  });
});

describe('toneFor', () => {
  it('separates boundaries from the rest', () => {
    expect(toneFor(0)).toBe('run');
    expect(toneFor(3)).toBe('run');
    expect(toneFor(4)).toBe('four');
    expect(toneFor(6)).toBe('six');
    // Five runs off the bat is legal and is not a boundary.
    expect(toneFor(5)).toBe('run');
  });
});

describe('regionOf', () => {
  it('names the wrap-around region once', () => {
    expect(regionOf(0)).toBe('straight');
    expect(regionOf(350)).toBe('straight');
    expect(regionOf(10)).toBe('straight');
  });

  it('always answers, for any angle', () => {
    for (let a = 0; a < 360; a += 1) expect(regionOf(a).length).toBeGreaterThan(0);
  });
});
