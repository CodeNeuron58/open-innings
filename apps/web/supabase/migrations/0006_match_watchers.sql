-- Who is watching a match right now.
--
-- Deliberately **not** a follow table. Following implies a subscription and a
-- notification, and there are no push notifications — a "follow" button
-- without them is a bookmark that does nothing. What the designs actually
-- wanted from that number is social proof for the scorer: eighteen people are
-- watching the game you are tapping through, which is the emotional payoff of
-- three hours of unpaid work.
--
-- So this counts presence, and the UI says "watching" rather than "following".
--
-- One row per (match, watcher) so a heartbeat every ten seconds updates a row
-- instead of inserting one. `watcher_key` is an anonymous id the client
-- generates and keeps — it identifies a browser or a device, never a person,
-- and is never joined to a user.

create table if not exists match_watchers (
  match_id uuid not null references matches(id) on delete cascade,
  watcher_key text not null,
  last_seen_at timestamptz not null default now(),
  primary key (match_id, watcher_key)
);

-- The only query: how many rows for this match are recent. Ordered so the
-- match id narrows first.
create index if not exists match_watchers_recent_idx
  on match_watchers (match_id, last_seen_at desc);

-- RLS on, no policies. Nothing reads this table through a client — the count
-- is computed server-side and only the number is ever sent — and an anonymous
-- presence key should not be readable by anyone.
alter table match_watchers enable row level security;
