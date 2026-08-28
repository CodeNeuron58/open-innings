/**
 * The geometry behind the wagon wheel — where a tap lands, and where a stored
 * placement draws.
 *
 * Kept out of the components because it is arithmetic, and arithmetic is the
 * half that can be wrong in a way nobody sees. A shot plotted ten degrees off
 * still looks like a wagon wheel.
 *
 * ## The convention, which is the database's
 *
 * `shotAngle` is **degrees clockwise from straight down the ground**, in the
 * striker's own frame — 0 is straight, 90 is square on one side, 180 is behind
 * the wicket, 270 is square on the other. `shotDistance` is **how far it
 * carried as a percentage of the way to the rope**, because grounds differ and
 * a scorer tapping a diagram is estimating a fraction of a picture.
 *
 * Both come from `ball_events`, whose column comments say the same thing. This
 * file must not invent a second convention.
 *
 * ## Handedness is not applied here
 *
 * The schema says handedness "lives on the player and is applied when the
 * wheel is drawn". It is not applied yet, because the card response carries
 * `batsmanName` and no batting style — so every wheel is drawn in the
 * striker's own frame, which is what is stored. For a right-hander that reads
 * the conventional way round; for a left-hander the off side appears where a
 * viewer expects the leg side. Mirroring needs `battingStyle` on the delivery
 * first, and guessing it here would put shots on the wrong side of the ground
 * with no way to tell.
 *
 * ## Screen coordinates
 *
 * y grows downward, so "up" is (0, -1) and the angle above maps to
 * `(sin θ, −cos θ)`. Every conversion in this file goes through that one pair.
 */

/** A placement as it is stored: both values, or neither. */
export type Placement = {
  /** 0–359, clockwise from straight down the ground. */
  angle: number;
  /** 0–100, percentage of the way to the rope. */
  distance: number;
};

/** A point in the diagram's own pixel space. */
export type Point = { x: number; y: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Where a tap on a square diagram of side `size` lands, as a placement.
 *
 * A tap dead in the centre has no direction — `atan2(0, 0)` is 0, which would
 * silently record "straight down the ground, no distance" for a scorer whose
 * finger happened to land on the stumps. That is returned as `null` so the
 * caller can ignore it rather than record a shot nobody played.
 */
export function placementFromTap(x: number, y: number, size: number): Placement | null {
  const radius = size / 2;
  const dx = x - radius;
  const dy = y - radius;

  const reach = Math.hypot(dx, dy);
  // Under a couple of pixels there is no meaningful direction to read.
  if (reach < 2) return null;

  const angle = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360) % 360;

  /*
   * Clamped rather than rejected. A scorer aiming at the rope will land
   * outside the circle about as often as inside it, and refusing that tap
   * would mean the six they were trying to record simply did not take.
   */
  const distance = clamp(Math.round((reach / radius) * 100), 1, 100);

  return { angle, distance };
}

/** Where a placement sits in a diagram of the given radius. */
export function pointFor(placement: Placement, radius: number): Point {
  const rad = (placement.angle * Math.PI) / 180;
  const reach = (placement.distance / 100) * radius;
  return {
    x: radius + Math.sin(rad) * reach,
    y: radius - Math.cos(rad) * reach,
  };
}

/**
 * A shot as a line from the middle, positioned for a plain rotated `View`.
 *
 * React Native rotates a view about its own centre, so the line is placed with
 * its midpoint at the shot's midpoint and then turned. That avoids depending
 * on `transformOrigin`, which would be the obvious way to do this and is one
 * more thing to be wrong across versions.
 *
 * A horizontal view points along (1, 0), and the shot points along
 * (sin θ, −cos θ), so the turn is θ − 90.
 */
export function lineFor(
  placement: Placement,
  radius: number,
  thickness = 1.5,
): { left: number; top: number; width: number; height: number; rotate: string } {
  const end = pointFor(placement, radius);
  const midX = (radius + end.x) / 2;
  const midY = (radius + end.y) / 2;
  const width = Math.hypot(end.x - radius, end.y - radius);

  return {
    left: midX - width / 2,
    top: midY - thickness / 2,
    width,
    height: thickness,
    rotate: `${placement.angle - 90}deg`,
  };
}

/**
 * The placement on a delivery, or null.
 *
 * The two columns are written together and read together — the schema and a
 * database constraint both say so — but a response is still a response, so
 * this is the one place that decides what a half-filled pair means. It means
 * no placement.
 */
export function placementOf(d: {
  shotAngle?: number | null;
  shotDistance?: number | null;
}): Placement | null {
  const { shotAngle: a, shotDistance: dist } = d;
  if (typeof a !== 'number' || typeof dist !== 'number') return null;
  return { angle: a, distance: dist };
}

/** How a shot is drawn: a boundary earns its own weight. */
export type ShotTone = 'four' | 'six' | 'run';

export function toneFor(runsOffBat: number): ShotTone {
  if (runsOffBat >= 6) return 'six';
  if (runsOffBat === 4) return 'four';
  return 'run';
}

/**
 * Which compass region an angle falls in, for a spoken label.
 *
 * Deliberately coarse. This is what a screen reader says about a dot on a
 * diagram, and "square on the off side" is useful where "137 degrees" is not.
 * Named in the striker's own frame, for the reason at the top of this file.
 */
export function regionOf(angle: number): string {
  const a = ((angle % 360) + 360) % 360;
  if (a < 23 || a >= 338) return 'straight';
  if (a < 68) return 'wide of straight, one side';
  if (a < 113) return 'square, one side';
  if (a < 158) return 'behind square, one side';
  if (a < 203) return 'fine, behind the wicket';
  if (a < 248) return 'behind square, other side';
  if (a < 293) return 'square, other side';
  return 'wide of straight, other side';
}
