-- =============================================================================
-- Open Innings — Row Level Security policies
-- =============================================================================
-- Apply this AFTER `drizzle-kit migrate` has created the tables.
-- It enables RLS and sets the access rules below.
--
-- ⚠️  v0.1 NOTE: RLS is DISABLED by default because our app uses a single
-- Postgres role for now (Supabase Auth is not in use). Authorization is
-- enforced at the application layer in lib/auth/. When we move to a
-- per-user DB role (or Supabase), re-enable this file.
--
-- To enable: `psql $DATABASE_URL -f supabase/migrations/0001_rls_policies.sql`
-- =============================================================================
--
-- Rule of thumb:
--   - "users"   → owner-only write, public read
--   - "players" → public read (so anyone can view player profiles), owner write
--   - "teams"   → public read, owner write
--   - "matches" → public read, scorer (created_by) write
--   - "innings" → same as parent match
--   - "ball_events" → public read (live scorecard is public), scorer write
--   - "tournaments" → public read, creator write
--
-- Public = no auth required to read. Required for shareable /m/{matchId} links.
-- =============================================================================

-- Helper: get the current authenticated user from a session variable.
-- The app sets `app.current_user_id` at the start of every request via
--   SET LOCAL app.current_user_id = '<uuid>';
-- Until we wire that up, this returns NULL and policies become restrictive.
create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Uncomment the block below to ENABLE RLS. Disabled in v0.1 (see header).
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