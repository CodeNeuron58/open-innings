-- 0003_innings_opening_players.sql
--
-- Add columns for the opening striker/non-striker/bowler of an innings.
-- These act as the seed for replay — once balls start, the engine recomputes
-- them from the ball_events table.
--
-- maxWickets: 10 for limited-overs, 2 for Super Over (innings 3/4).

ALTER TABLE innings
  ADD COLUMN IF NOT EXISTS opening_striker_id   uuid REFERENCES players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opening_non_striker_id uuid REFERENCES players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opening_bowler_id    uuid REFERENCES players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS max_wickets          smallint NOT NULL DEFAULT 10;

-- Index for looking up an innings by (matchId, number)
-- Already exists as innings_match_number_idx — no need to re-add.