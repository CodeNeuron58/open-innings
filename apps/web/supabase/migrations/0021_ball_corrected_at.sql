-- Migration 0021: which deliveries were corrected
--
-- A corrected ball is indistinguishable from one that was right first time.
-- Nothing in the log, the console or the scorecard says a delivery was edited,
-- so the card cannot be read as a record of what happened *and* of what was
-- decided about it afterwards.
--
-- That matters more here than in most apps, because the argument this product
-- makes is that the ball log is the truth: every scorecard and every career
-- figure is a replay of it. An edit that leaves no trace quietly undercuts the
-- claim — somebody who watched the match and remembers a four where the card
-- shows a single has no way to tell whether they misremembered or whether the
-- scorer changed it.
--
-- A timestamp rather than a boolean, for the same reason `users` stores
-- `email_verified_at`: "when" answers "whether" for free, and a boolean throws
-- the answer away. The first time anybody asks whether a delivery was edited
-- before or after a result was shared, the column already knows.
--
-- Null is "never corrected", which is every delivery recorded so far and the
-- overwhelming majority of every delivery to come.

ALTER TABLE ball_events
  ADD COLUMN IF NOT EXISTS corrected_at timestamptz;

CREATE INDEX IF NOT EXISTS ball_events_corrected_idx
  ON ball_events (innings_id)
  WHERE corrected_at IS NOT NULL;

COMMENT ON COLUMN ball_events.corrected_at IS
  'When this delivery was last edited. NULL means it was never corrected.';
