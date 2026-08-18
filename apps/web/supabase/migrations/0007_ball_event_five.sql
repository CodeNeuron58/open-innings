-- =============================================================================
-- Open Innings — five runs off the bat
-- =============================================================================
-- `ball_event_type` went 'dot','1','2','3','4','6' and skipped five, but the
-- scorer's keypad has a 5 key and the engine has always accepted runsOffBat
-- 0..6. So tapping it built an event whose type the database would not accept,
-- the insert failed, and the scorer got "Internal error" with the ball lost.
--
-- Five is ordinary cricket: an all-run five, or four overthrows onto a single.
-- The keypad was right and the enum was incomplete, so the enum gets the value
-- rather than the keypad losing the key.
--
-- ALTER TYPE ... ADD VALUE is not reversible in Postgres. Removing an enum
-- member means recreating the type and rewriting every column that uses it,
-- which is why there is no down migration here — as with every other file in
-- this directory.
-- =============================================================================

ALTER TYPE "public"."ball_event_type" ADD VALUE IF NOT EXISTS '5' AFTER '4';
