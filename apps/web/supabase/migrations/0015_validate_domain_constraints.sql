-- =============================================================================
-- Open Innings — promote the NOT VALID constraints
-- =============================================================================
-- Migration 0010 added eighteen CHECK constraints `not valid`, and 0012 added
-- a nineteenth. That was the right call: they run in Heroku's release phase,
-- and a full-table scan that trips over a row written months earlier would
-- take the deploy down rather than the data.
--
-- `not valid` still enforces every INSERT and UPDATE from the moment it is
-- added, so new writes have always been protected. What it does not do is
-- confirm that the rows already there satisfy the rule — and until that is
-- confirmed, three things stay true:
--
--   * `pg_dump` records them as NOT VALID too, so a restored database
--     inherits the same unverified state. The backup is not a clean slate.
--   * The planner cannot use them for constraint exclusion.
--   * Nobody ever finds out whether the pre-0010 rows actually satisfy
--     `total_runs = runs_off_bat + extra_runs`, which 0010 itself calls the
--     one that matters most.
--
-- 0010 left the promotion as a manual step. It stayed manual, which is the
-- usual fate of manual steps: there was no migration, script, or runbook entry
-- that ever ran it, so the honest forecast was that these remain NOT VALID for
-- ever. This file is that step, done automatically.
--
-- ## Why this is safe to run unattended
--
-- Two reasons, and the second is the one that matters.
--
-- First, `validate constraint` takes only a SHARE UPDATE EXCLUSIVE lock. It
-- does not block reads or writes, so it can run against a live database.
--
-- Second, **a failure here cannot fail the deploy.** Each validation is
-- wrapped in its own exception handler: a constraint whose existing rows
-- violate it raises a warning, stays NOT VALID exactly as it is today, and the
-- release phase carries on. So the worst case of this migration is the status
-- quo, and the best case is nineteen constraints that are actually verified.
--
-- That asymmetry is deliberate. The alternative — letting it fail loudly — is
-- the reason 0010 declined to do this in the first place.
--
-- ## When it will succeed
--
-- The production database holds test data only: one verification account, four
-- players, two teams, and no matches. `ball_events`, `innings` and `matches`
-- are empty, so every scan below is over zero rows. It was also written under
-- an older, laxer engine and has never been checked against the rules the
-- engine now applies — which is the argument for resetting it rather than
-- trusting it, and after a reset these validate against nothing at all.
-- =============================================================================

do $$
declare
  c record;
begin
  for c in
    select * from (values
      -- ── ball_events ───────────────────────────────────────────────────────
      ('ball_events', 'ball_events_runs_off_bat_range'),
      ('ball_events', 'ball_events_extra_runs_range'),
      ('ball_events', 'ball_events_total_runs_sum'),
      ('ball_events', 'ball_events_over_number_range'),
      ('ball_events', 'ball_events_ball_number_range'),
      ('ball_events', 'ball_events_wicket_has_player'),

      -- ── innings ───────────────────────────────────────────────────────────
      ('innings', 'innings_number_range'),
      ('innings', 'innings_max_wickets_range'),
      ('innings', 'innings_wickets_range'),
      ('innings', 'innings_runs_range'),
      ('innings', 'innings_balls_range'),
      ('innings', 'innings_extras_range'),
      ('innings', 'innings_teams_differ'),
      ('innings', 'innings_target_positive'),

      -- ── matches ───────────────────────────────────────────────────────────
      ('matches', 'matches_teams_differ'),
      ('matches', 'matches_overs_range'),
      ('matches', 'matches_bowler_quota_range'),
      ('matches', 'matches_toss_all_or_nothing'),

      -- ── verification_tokens (0012) ────────────────────────────────────────
      ('verification_tokens', 'verification_tokens_code_salt_shape')
    ) as t(tbl, name)
  loop
    -- Skip what is absent or already validated. `convalidated` means this has
    -- been checked against existing rows, so re-running is a genuine no-op
    -- rather than a repeated scan.
    if exists (
      select 1 from pg_constraint
      where conname = c.name and convalidated = false
    ) then
      begin
        execute format('alter table %I validate constraint %I', c.tbl, c.name);
        raise notice 'validated %.%', c.tbl, c.name;
      exception
        when others then
          -- Existing rows violate it. Leave it NOT VALID — which is what it
          -- was a moment ago — and say so loudly enough to be found in the
          -- release log, without taking the deploy down.
          raise warning 'could not validate %.%: % — left NOT VALID',
            c.tbl, c.name, sqlerrm;
      end;
    end if;
  end loop;
end $$;
