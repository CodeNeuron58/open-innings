-- =============================================================================
-- Open Innings — one ball per position, and honest foreign keys
-- =============================================================================

-- 1. A delivery cannot happen twice in the same place.
--
-- POST /ball reads every ball in the innings, computes `ballNumber` as
-- length + 1, and inserts. Two requests that overlap therefore compute the
-- same number and both succeed: a double tap, a retry on a flaky connection
-- at a ground, or the scorer's phone re-sending after a timeout all produce a
-- duplicate delivery that replays into the score.
--
-- The index over (innings_id, ball_number) already existed and was not
-- unique, so nothing refused the second write. Making it unique turns a
-- silently corrupted scorecard into a failed request the client can retry.
--
-- Recreated rather than altered — Postgres has no ALTER INDEX ... SET UNIQUE.
DROP INDEX IF EXISTS "ball_events_innings_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "ball_events_innings_idx"
  ON "ball_events" USING btree ("innings_id", "ball_number");

-- 2. Four foreign keys said SET NULL on columns declared NOT NULL.
--
-- Those cannot both hold. Deleting a user would have tried to write NULL into
-- a NOT NULL column and failed on the constraint, so the declared behaviour
-- was unreachable — the database would refuse the delete for the wrong
-- reason, with a confusing error.
--
-- The project's actual policy is in the schema's own header: users are
-- anonymised, never hard-deleted, so historical match records stay valid.
-- `users.anonymised_at` is that mechanism and both the session lookup and the
-- login path already honour it. RESTRICT states that policy plainly: you may
-- not delete a user who owns data, and the way to remove someone is to
-- anonymise them.
--
-- players.created_by is left alone: it is genuinely nullable, so SET NULL
-- there is coherent.

ALTER TABLE "teams" DROP CONSTRAINT IF EXISTS "teams_owner_id_users_id_fk";
ALTER TABLE "teams" ADD CONSTRAINT "teams_owner_id_users_id_fk"
  FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id")
  ON DELETE restrict ON UPDATE no action;

ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_created_by_users_id_fk";
ALTER TABLE "matches" ADD CONSTRAINT "matches_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
  ON DELETE restrict ON UPDATE no action;

ALTER TABLE "ball_events" DROP CONSTRAINT IF EXISTS "ball_events_created_by_users_id_fk";
ALTER TABLE "ball_events" ADD CONSTRAINT "ball_events_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
  ON DELETE restrict ON UPDATE no action;

ALTER TABLE "tournaments" DROP CONSTRAINT IF EXISTS "tournaments_created_by_users_id_fk";
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
  ON DELETE restrict ON UPDATE no action;
