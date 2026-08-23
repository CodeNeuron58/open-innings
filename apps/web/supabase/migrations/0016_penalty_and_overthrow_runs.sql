-- Migration 0016: penalty event type + overthrow_runs column
--
-- 1. Add 'penalty' to the ball_event_type enum (Law 41/42 — 5-run fielding
--    penalty for helmet-on-field, ball tampering, unfair play, etc.).
--    Postgres requires ALTER TYPE to add enum values; we cannot use CREATE TYPE.
--
-- 2. Add overthrow_runs column to ball_events.
--    Law 18.6 / 19.8: runs crossed after the ball deflects off a fielder are
--    credited to the team total but NOT to the individual batter's tally.
--    Existing rows default to 0 (correct — no overthrow was ever recorded).

ALTER TYPE ball_event_type ADD VALUE IF NOT EXISTS 'penalty';

ALTER TABLE ball_events
  ADD COLUMN IF NOT EXISTS overthrow_runs smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN ball_events.overthrow_runs IS
  'Runs crossed after a deflection off a fielder (Law 18.6 / 19.8). '
  'Added to team total but not credited to the batter. Zero for ordinary deliveries.';
