-- People who asked to be told when the app is out.
--
-- Deliberately separate from `users`: leaving an address on the landing page
-- is not creating an account, and turning one into the other is how a mailing
-- list becomes a data-protection problem.
--
-- `source` records which page it came from, so a later decision about who to
-- contact — release notes, or testers for the closed track — rests on
-- something better than a guess.

create table if not exists notify_signups (
  id uuid primary key default gen_random_uuid(),
  -- Lower-cased by the route before it gets here. Unique, so a second
  -- submission is not a second row: people tap twice, and the honest answer
  -- to that is "yes, you're on the list" rather than a duplicate.
  email text not null unique,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists notify_signups_created_idx on notify_signups (created_at);

-- Row-level security, consistent with every other table here.
--
-- No policies are granted. Nothing in the app reads this table — the route
-- that writes to it uses the service connection — and an address someone left
-- on a landing page should not be readable by any client, signed in or not.
-- Enabling RLS with no policy is how that is stated rather than assumed.
alter table notify_signups enable row level security;
