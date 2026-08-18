-- =============================================================================
-- Open Innings — the invariants, stated where the data lives
-- =============================================================================
-- Every rule below was already enforced in Zod, and Zod guards exactly one
-- path: a JSON body arriving at a route handler. The seed writes rows directly.
-- So do the smoke scripts, `drizzle-kit push`, a psql session at eleven at
-- night, and any correction endpoint written later.
--
-- For a system whose whole claim is that `ball_events` is the truth, the truth
-- is worth constraining. `total_runs = runs_off_bat + extra_runs` is not a
-- preference; a row where it does not hold makes the scorecard and the score
-- disagree with no error anywhere to explain it.
--
-- ## Why NOT VALID
--
-- A plain ADD CONSTRAINT scans the whole table and fails if one historical row
-- violates it. This migration runs in Heroku's release phase, so that failure
-- takes the deploy with it — and it would be a deploy failing over data
-- written months ago rather than over anything in the release.
--
-- NOT VALID skips the scan and still enforces the rule on every INSERT and
-- UPDATE from this moment on, which is the part that matters. Existing rows are
-- accepted as-is until somebody checks them.
--
-- To promote one once the existing rows are known good:
--
--     alter table ball_events validate constraint ball_events_total_runs_sum;
--
-- That takes only a SHARE UPDATE EXCLUSIVE lock, so it does not block reads or
-- writes and can be run against a live database. Do it per constraint, after
-- running the same predicate as a SELECT and seeing zero rows.
--
-- ## Why the DO block
--
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS. The migration runner records a
-- file as applied only after the whole file succeeds, so a failure part-way
-- through a bare list would leave some constraints added and the file marked
-- pending — and the retry would then fail on the ones that already exist. This
-- loop is idempotent, so a retry is a no-op over what already landed.
-- =============================================================================

do $$
declare
  c record;
begin
  for c in
    select * from (values
      -- ── ball_events — the source of truth ─────────────────────────────────
      -- 0..6 off the bat. Not 7: a no-ball's penalty is an extra, not a run
      -- off the bat, so the bat itself never scores more than six.
      ('ball_events', 'ball_events_runs_off_bat_range', 'runs_off_bat between 0 and 6'),
      -- Well above anything real (a no-ball struck for six with byes run), and
      -- bounded, which is the point.
      ('ball_events', 'ball_events_extra_runs_range',   'extra_runs between 0 and 12'),
      -- The one that matters most. These three columns are read separately by
      -- the engine, the scorecard and the career SQL.
      ('ball_events', 'ball_events_total_runs_sum',     'total_runs = runs_off_bat + extra_runs'),
      ('ball_events', 'ball_events_over_number_range',  'over_number >= 0'),
      ('ball_events', 'ball_events_ball_number_range',  'ball_number >= 1'),
      -- A dismissal names somebody. The engine now refuses a wicket type with
      -- no player, and this says the same thing where the row is written.
      ('ball_events', 'ball_events_wicket_has_player',
        'wicket_type is null or wicket_player_id is not null'),

      -- ── innings ───────────────────────────────────────────────────────────
      ('innings', 'innings_number_range',    'innings_number between 1 and 4'),
      -- Ten for a full side, two for a super over, fewer for a short one — but
      -- never zero, or the innings is over before it starts.
      ('innings', 'innings_max_wickets_range', 'max_wickets between 1 and 10'),
      ('innings', 'innings_wickets_range',   'wickets >= 0 and wickets <= max_wickets'),
      ('innings', 'innings_runs_range',      'runs >= 0'),
      ('innings', 'innings_balls_range',     'balls_bowled >= 0'),
      ('innings', 'innings_extras_range',    'extras >= 0'),
      ('innings', 'innings_teams_differ',    'batting_team_id <> bowling_team_id'),
      ('innings', 'innings_target_positive', 'target is null or target > 0'),

      -- ── matches ───────────────────────────────────────────────────────────
      ('matches', 'matches_teams_differ',    'team_a_id <> team_b_id'),
      ('matches', 'matches_overs_range',     'overs_per_innings between 1 and 200'),
      ('matches', 'matches_bowler_quota_range',
        'max_overs_per_bowler is null or max_overs_per_bowler between 1 and 200'),
      -- The toss is all-or-nothing: a winner with no decision says nothing
      -- about who bats, and `resolveBattingSides` would silently default.
      ('matches', 'matches_toss_all_or_nothing',
        '(toss_winner_team_id is null) = (toss_decision is null)')
    ) as t(tbl, name, expr)
  loop
    if not exists (select 1 from pg_constraint where conname = c.name) then
      execute format('alter table %I add constraint %I check (%s) not valid', c.tbl, c.name, c.expr);
    end if;
  end loop;
end $$;
