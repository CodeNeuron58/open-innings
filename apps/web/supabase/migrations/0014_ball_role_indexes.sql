-- =============================================================================
-- Open Innings — the three unindexed player-role columns
-- =============================================================================
-- `ball_events` records five player roles per delivery — batsman, non-striker,
-- bowler, wicket player, fielder — and migration 0000 indexed two of them.
-- The career page queries all five.
--
--   lib/db/stats.ts   where be.batsman_id = $1 or be.wicket_player_id = $1
--
-- Postgres cannot build a bitmap OR across one indexed and one unindexed
-- column, so this plans as a sequential scan of every ball ever bowled. It is
-- the batting career page — the thing the README calls the artefact people
-- share — and it gets slower with every match anyone scores, not with the
-- size of the answer.
--
--   lib/db/stats.ts   where be.fielder_id = $1
--
-- Same page, same scan, no index at all.
--
-- The delete path pays too. `mergePlayerInto` ends in `delete from players`,
-- and five foreign keys reference `ball_events`; each unindexed one is
-- another full scan to validate the delete, with a row lock held throughout.
--
-- `created_by` is included for the same FK reason. Nothing queries on it, but
-- deleting a user has to check it, and it is the same one-line fix.
-- =============================================================================

create index if not exists ball_events_non_striker_idx on ball_events (non_striker_id);
create index if not exists ball_events_wicket_player_idx on ball_events (wicket_player_id);
create index if not exists ball_events_fielder_idx on ball_events (fielder_id);
create index if not exists ball_events_created_by_idx on ball_events (created_by);
