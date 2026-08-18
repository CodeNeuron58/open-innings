-- =============================================================================
-- Open Innings — playing conditions the engine can enforce
-- =============================================================================
-- Two conditions that vary by competition and therefore cannot be constants in
-- packages/scoring/src/rules.ts. Both are nullable, and null means "as before",
-- so every match that already exists is unaffected.
-- =============================================================================

-- 1. How many overs one bowler may bowl.
--
-- A playing condition, not a Law — a fifth of the innings rounded up is the
-- near-universal limited-overs rule (4 in a T20, 10 in a 50-over game), but
-- gully cricket with four players a side ignores it and has to be able to.
--
-- Until now it existed only as a number rendered in the mobile end-of-over
-- screen, so it was a courtesy on one client: the web, the API and any replay
-- would happily let one bowler send down all twenty overs.
--
-- NULL = unenforced, and that is the safe default rather than a coy one. A
-- quota the bowling side cannot cover between them would deadlock an innings
-- with no bowler left who is allowed to bowl, so the service only sets it when
-- the squad is big enough to see the innings out under it.
alter table matches add column if not exists max_overs_per_bowler smallint;

-- 2. Did this delivery change the bowler part-way through an over?
--
-- Law 17.4 forbids it except when a bowler cannot continue — injury, or being
-- suspended from bowling — so the engine now refuses a mid-over change unless
-- the scorer says this is one of those cases.
--
-- Persisted rather than kept to the request, and that is the whole reason it
-- is a column. Replay re-validates every stored delivery through the same
-- engine, so an override that lived only in the POST body would make the
-- innings that used it stop replaying the moment it was read back.
alter table ball_events
  add column if not exists bowler_replaced_mid_over boolean not null default false;
