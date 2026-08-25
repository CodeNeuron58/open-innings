-- Migration 0019: where the ball went
--
-- Reserved rather than used. Nothing in the app writes these yet and nothing
-- reads them; this migration exists because the cost of adding the column now
-- and the cost of adding it later are wildly different.
--
-- The ball log is the source of truth for everything in this product — every
-- scorecard, every career figure, every share card is a replay of it. A column
-- added later is a column that is null for every delivery already recorded,
-- and there is no way to go back and fill it in: nobody remembers where a
-- cover drive went in a match three seasons ago. So a wagon wheel added later
-- starts empty and stays empty for the whole history, however good the feature
-- is when it arrives.
--
-- Adding the column now means the day the console learns to capture placement,
-- every ball scored from then on has it — and the gap is bounded by when the
-- UI ships rather than by when somebody thought of the schema.
--
-- ## The two numbers
--
-- A wagon wheel needs exactly two things per scoring shot, and this is them.
--
--   shot_angle    degrees clockwise from straight down the ground, 0..359,
--                 from the striker's own point of view. Handedness is a
--                 property of the batter (`players.batting_style`) and not of
--                 the delivery, so it is deliberately not baked in here — a
--                 left-hander's cover drive and a right-hander's are the same
--                 angle and get mirrored at render time, which is the only
--                 place that knows which way round to draw the field.
--
--   shot_distance how far it carried, as a percentage of the way to the rope.
--                 Not metres: grounds differ, boundary ropes move between
--                 innings, and a scorer tapping a diagram is estimating a
--                 fraction of a picture rather than measuring a field.
--
-- Both nullable, and null is the ordinary case. A dot ball has no placement, a
-- wide has no placement, and a scorer who does not want to tap a diagram for
-- every delivery must not be forced to — the feature is opt-in per match in
-- every app that has it, and the schema has to allow "not recorded" as a
-- first-class answer rather than a zero that means something.

ALTER TABLE ball_events
  ADD COLUMN IF NOT EXISTS shot_angle smallint,
  ADD COLUMN IF NOT EXISTS shot_distance smallint;

-- A circle, and a percentage. Stated as constraints because the alternative is
-- discovering a 400-degree shot when somebody tries to draw it.
ALTER TABLE ball_events DROP CONSTRAINT IF EXISTS ball_events_shot_angle_range;

ALTER TABLE ball_events
  ADD CONSTRAINT ball_events_shot_angle_range
  CHECK (shot_angle IS NULL OR (shot_angle >= 0 AND shot_angle <= 359));

ALTER TABLE ball_events DROP CONSTRAINT IF EXISTS ball_events_shot_distance_range;

ALTER TABLE ball_events
  ADD CONSTRAINT ball_events_shot_distance_range
  CHECK (shot_distance IS NULL OR (shot_distance >= 0 AND shot_distance <= 100));

-- An angle without a distance is half a point and cannot be plotted; a
-- distance without an angle is a length in no direction. Either both or
-- neither.
ALTER TABLE ball_events DROP CONSTRAINT IF EXISTS ball_events_shot_placement_pair;

ALTER TABLE ball_events
  ADD CONSTRAINT ball_events_shot_placement_pair
  CHECK ((shot_angle IS NULL) = (shot_distance IS NULL));

-- Only the deliveries that have one. A partial index, because for a long time
-- almost every row will be null and there is no reason to carry them.
CREATE INDEX IF NOT EXISTS ball_events_shot_idx
  ON ball_events (innings_id)
  WHERE shot_angle IS NOT NULL;
