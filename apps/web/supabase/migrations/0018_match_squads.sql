-- Migration 0018: the playing XI, as a thing that exists
--
-- The mobile wizard has had a "Pick the XI" step since it was written. What it
-- picked was never sent anywhere: `selected` filtered the striker and
-- non-striker pickers on the following step and was then dropped on the floor.
-- `createMatchWithFirstInnings` called `getTeamMembers()` for both sides, so
-- every match ran on the **entire club roster**.
--
-- That is not only a longer list to scroll. Two playing conditions are sized
-- from squad length at creation:
--
--   sizeMaxWickets(battingSquad.length)  — a seven-a-side game played out of a
--       twelve-player roster got ten wickets instead of six, so the innings
--       could not end the way the match was actually played.
--
--   sizeBowlerQuota(…, bowlingSquad.length) — the "can this side cover the
--       innings under the usual fifth" test counted people who were not there.
--
-- Both were wrong in the same direction and neither was visible until a match
-- refused to end.
--
-- The XI belongs to the **match**, not to an innings: the same eleven bat and
-- field in both innings of a limited-overs game and in a Super Over. Holding
-- it per innings would mean storing it twice and keeping the copies in step.
--
-- Absence stays meaningful. Every match created before this migration has no
-- rows here, and inventing an XI for them from a roster would be a guess about
-- who actually played. The service therefore reads "no rows" as "the whole
-- roster", which is exactly the behaviour those matches were scored under.

CREATE TABLE IF NOT EXISTS match_squads (
  match_id uuid NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams (id) ON DELETE RESTRICT,
  player_id uuid NOT NULL REFERENCES players (id) ON DELETE RESTRICT,

  -- Where they are down to bat. Null means "not decided", which is the honest
  -- answer for most club cricket — the order is settled at the fall of a
  -- wicket, not at the toss.
  batting_order smallint,

  is_captain boolean NOT NULL DEFAULT false,
  is_wicketkeeper boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (match_id, team_id, player_id)
);

-- The access path that matters: "who is playing in this match", asked once per
-- scorer load and once per ball correction replay.
CREATE INDEX IF NOT EXISTS match_squads_match_idx ON match_squads (match_id);

-- And the reverse, for a career page asking which matches somebody was named
-- in — including the ones they were named in and did not bat.
CREATE INDEX IF NOT EXISTS match_squads_player_idx ON match_squads (player_id);

-- A batting order, where one is given, is a position in a side. Eleven is the
-- usual maximum but not a Law, and this table has to hold a gully game's
-- fifteen as readily as a league XI.
ALTER TABLE match_squads DROP CONSTRAINT IF EXISTS match_squads_batting_order_range;

ALTER TABLE match_squads
  ADD CONSTRAINT match_squads_batting_order_range
  CHECK (batting_order IS NULL OR (batting_order >= 1 AND batting_order <= 20));

-- RLS, following team_members: the squad is public because the scorecard is,
-- and it is written by whoever owns the match.
ALTER TABLE match_squads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "match squads are publicly readable" ON match_squads;

CREATE POLICY "match squads are publicly readable"
  ON match_squads FOR SELECT USING (true);

DROP POLICY IF EXISTS "match creators can manage squads" ON match_squads;

CREATE POLICY "match creators can manage squads"
  ON match_squads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_squads.match_id
        AND m.created_by = public.current_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_squads.match_id
        AND m.created_by = public.current_user_id()
    )
  );
