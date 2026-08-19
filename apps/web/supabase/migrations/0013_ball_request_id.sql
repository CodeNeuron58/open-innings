-- =============================================================================
-- Open Innings — idempotency for delivery submission
-- =============================================================================
-- Migration 0008 made (innings_id, ball_number) unique and called it a defence
-- against "a retry after a timeout on ground-side mobile data". It is not, and
-- the difference is worth stating precisely because the two cases look alike.
--
-- The ball number is derived from the stored log: `state.balls.length + 1`,
-- recomputed from a fresh read on every request. So:
--
--   Two devices, same instant. Both read N balls, both compute N+1, one wins,
--   the other gets 23505 and a clean 409. The unique index does exactly its
--   job.
--
--   One device, lost response. The write SUCCEEDED and the 200 never arrived.
--   The client retries. The server re-reads, now finds N+1 balls, computes
--   N+2, and inserts. No conflict, because it genuinely is a different ball
--   number. The delivery is recorded TWICE and replays into the score twice.
--
-- The second is the one that happens at a ground, and nothing caught it. A
-- ball number derived from server state cannot: the state moved, so the derived
-- value moves with it. Only something the client generates once and resends
-- unchanged can tell a retry from a new delivery.
--
-- Hence request_id. The client mints a uuid per delivery, keeps it across
-- retries of that delivery, and the index below makes the second write of the
-- same id impossible. The route treats the conflict as success and returns
-- current state, because a retry whose original succeeded should look to the
-- scorer exactly like the success they never saw.
--
-- Nullable, and the index is partial, for two reasons: every row written
-- before this migration has no id and must not collide with the others, and an
-- older client that does not send one still scores — with the old behaviour,
-- which is no worse than what it has today.
-- =============================================================================

alter table ball_events add column if not exists request_id uuid;

create unique index if not exists ball_events_request_id_key
  on ball_events (request_id)
  where request_id is not null;

comment on column ball_events.request_id is
  'Client-generated id for one delivery, stable across retries of that delivery. Distinguishes a resent request from a genuinely new ball, which a server-derived ball number cannot.';
