-- Migration 0017: Update total_runs constraint for overthrows + performance indexes
--
-- 1. Update ball_events_total_runs_sum constraint:
--    Migration 0010 enforced `total_runs = runs_off_bat + extra_runs`.
--    Migration 0016 added `overthrow_runs` (Law 18.6 / 19.8).
--    Total runs on any delivery is now `runs_off_bat + overthrow_runs + extra_runs`.
--
-- 2. Add domain range constraint on overthrow_runs (between 0 and 12).
--
-- 3. Add missing access path indexes on players.created_by and innings.bowling_team_id.

ALTER TABLE ball_events DROP CONSTRAINT IF EXISTS ball_events_total_runs_sum;

ALTER TABLE ball_events
  ADD CONSTRAINT ball_events_total_runs_sum
  CHECK (total_runs = runs_off_bat + overthrow_runs + extra_runs);

ALTER TABLE ball_events
  ADD CONSTRAINT ball_events_overthrow_runs_range
  CHECK (overthrow_runs >= 0 AND overthrow_runs <= 12);

CREATE INDEX IF NOT EXISTS players_created_by_idx ON players (created_by);
CREATE INDEX IF NOT EXISTS innings_bowling_team_idx ON innings (bowling_team_id);
