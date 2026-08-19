-- =============================================================================
-- Open Innings — Row Level Security: not in use, and why
-- =============================================================================
-- This migration is a NO-OP apart from one helper function. It is kept in the
-- sequence because it has already been applied and recorded, and because the
-- policy draft below is still the design worth returning to.
--
-- READ THIS BEFORE UNCOMMENTING ANYTHING.
--
-- Authorization in this app is enforced entirely in the route handlers, by
-- comparing `created_by` / `owner_id` against the session user. There is no
-- second line of defence behind that, so a missing check in a handler is a
-- full authorization bypass. That is a deliberate trade for v0.1, not an
-- oversight — but it should be an informed one.
--
-- Two things are true today, and BOTH must change before the block below can
-- do anything at all:
--
--   1. `app.current_user_id` is never set. Nothing in the codebase calls
--      `set_config` or `SET LOCAL` — grep and see. So `current_user_id()`
--      returns NULL on every connection, every `using (x = current_user_id())`
--      evaluates NULL rather than true, and every policy DENIES. Uncommenting
--      this block without wiring that up locks the application out of its own
--      database on the next deploy.
--
--   2. The application connects as the table owner. `scripts/migrate.ts`
--      creates the tables, so the role the app uses owns them, and an owner
--      bypasses RLS unless the table is marked `force row level security`.
--      No table here is. So even with policies enabled and the session
--      variable set, they would not be consulted.
--
-- Doing this properly means a second, non-owning role for the application,
-- `force row level security` on each table, and a `SET LOCAL` at the start of
-- every request — most naturally in the `db` wrapper in lib/db/client.ts, so
-- no query can be issued without it.
--
-- The header this file used to carry said RLS was "disabled by default" and
-- pointed at `drizzle-kit migrate` and a manual `psql -f`. None of that was
-- accurate: migrations run through scripts/migrate.ts, this file among them,
-- and "disabled" undersold the situation — the policies could not have worked
-- if they had been enabled. It also referred to Supabase Auth, which this
-- project has never used; the folder name is the last trace of that.
-- =============================================================================

-- The helper the draft policies below would call. Created rather than dropped
-- so a fresh database matches the one already in production, where this has
-- been applied since day one. Nothing calls it today.
create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- DESIGN REFERENCE ONLY — see the two preconditions above. Uncommenting this
-- as it stands denies every query the application makes.
-- ─────────────────────────────────────────────────────────────────────────────
/*

-- Enable RLS
alter table users enable row level security;
alter table players enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table tournaments enable row level security;
alter table tournament_teams enable row level security;
alter table matches enable row level security;
alter table innings enable row level security;
alter table ball_events enable row level security;

-- users
create policy "users are publicly readable"
  on users for select using (true);

create policy "users can update their own row"
  on users for update
  using (id = public.current_user_id())
  with check (id = public.current_user_id());

-- players
create policy "players are publicly readable"
  on players for select using (true);

create policy "authenticated users can create players"
  on players for insert with check (created_by = public.current_user_id());

create policy "creators can update their players"
  on players for update
  using (created_by = public.current_user_id())
  with check (created_by = public.current_user_id());

-- teams
create policy "teams are publicly readable"
  on teams for select using (true);

create policy "owners can create teams"
  on teams for insert with check (owner_id = public.current_user_id());

create policy "owners can update their teams"
  on teams for update
  using (owner_id = public.current_user_id())
  with check (owner_id = public.current_user_id());

create policy "team members are publicly readable"
  on team_members for select using (true);

create policy "team owners can manage rosters"
  on team_members for all
  using (
    exists (
      select 1 from teams t
      where t.id = team_members.team_id
        and t.owner_id = public.current_user_id()
    )
  )
  with check (
    exists (
      select 1 from teams t
      where t.id = team_members.team_id
        and t.owner_id = public.current_user_id()
    )
  );

-- matches
create policy "matches are publicly readable"
  on matches for select using (true);

create policy "authenticated users can create matches"
  on matches for insert with check (created_by = public.current_user_id());

create policy "creators can update their matches"
  on matches for update
  using (created_by = public.current_user_id())
  with check (created_by = public.current_user_id());

-- innings
create policy "innings are publicly readable"
  on innings for select using (true);

create policy "match creators can manage innings"
  on innings for all
  using (
    exists (
      select 1 from matches m
      where m.id = innings.match_id
        and m.created_by = public.current_user_id()
    )
  )
  with check (
    exists (
      select 1 from matches m
      where m.id = innings.match_id
        and m.created_by = public.current_user_id()
    )
  );

-- ball_events
create policy "ball events are publicly readable"
  on ball_events for select using (true);

create policy "match scorers can create ball events"
  on ball_events for insert with check (
    exists (
      select 1 from innings i
      join matches m on m.id = i.match_id
      where i.id = ball_events.innings_id
        and m.created_by = public.current_user_id()
    )
  );

create policy "match scorers can update ball events"
  on ball_events for update
  using (
    exists (
      select 1 from innings i
      join matches m on m.id = i.match_id
      where i.id = ball_events.innings_id
        and m.created_by = public.current_user_id()
    )
  )
  with check (
    exists (
      select 1 from innings i
      join matches m on m.id = i.match_id
      where i.id = ball_events.innings_id
        and m.created_by = public.current_user_id()
    )
  );

create policy "match scorers can delete ball events"
  on ball_events for delete using (
    exists (
      select 1 from innings i
      join matches m on m.id = i.match_id
      where i.id = ball_events.innings_id
        and m.created_by = public.current_user_id()
    )
  );

-- tournaments
create policy "tournaments are publicly readable"
  on tournaments for select using (true);

create policy "creators can manage their tournaments"
  on tournaments for all
  using (created_by = public.current_user_id())
  with check (created_by = public.current_user_id());

create policy "tournament teams are publicly readable"
  on tournament_teams for select using (true);

create policy "tournament creators can manage their tournament teams"
  on tournament_teams for all
  using (
    exists (
      select 1 from tournaments t
      where t.id = tournament_teams.tournament_id
        and t.created_by = public.current_user_id()
    )
  )
  with check (
    exists (
      select 1 from tournaments t
      where t.id = tournament_teams.tournament_id
        and t.created_by = public.current_user_id()
    )
  );

*/