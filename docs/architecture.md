# Architecture

For what the project is and what it does, see [`/README.md`](../README.md).
This file is for people **changing** the code, and it is deliberately short: it
covers the three decisions that are expensive to reverse and easy to undo by
accident.

Everything else — the stack, the roadmap, the file map, the law coverage — is
in the README, and was duplicated here until the two copies disagreed.

---

## 1. `ball_events` is the source of truth. Everything else is derived.

The scorecard, career figures, the club page, the share cards, the wagon wheel:
all of them are computed by replaying `ball_events` rows through
`applyBall`. **No derived number is stored as though it were a fact.**

This buys three things:

- **Undo is not a reverse operation.** Drop the last row and replay. There is
  no un-apply function to get wrong, which is why undo cannot leave the
  scorecard in a corrupt state.
- **A correction cascades correctly.** Changing the third ball of an over
  rotates the strike for every delivery after it. Replay gets that right for
  free; a patch-in-place would have to reason about it.
- **Every figure is auditable.** `pnpm db:verify` replays the whole database
  against the current rules and reports anything they now refuse.

It costs one thing: replay runs on every read. `innings.runs/wickets/balls_bowled`
are cached for fast list rendering, and they are a **cache** — if they ever
disagree with the log, the log wins.

**Do not optimise this away.** The temptation arrives as "we could just store
the batter's total". Resist it. The moment a derived number is written down,
there are two answers to the same question and no way to tell which is stale.

### Validate on write, tolerate on read

Because replay runs on every read, a rule tightened today would otherwise be
applied retroactively to deliveries recorded before it existed — and a match
containing one would stop rendering, which for a public scorecard means a
shared link breaking because the laws improved.

So `applyBall` takes a mode. `strict` throws, and is what recording a delivery
uses. `replay` applies the delivery anyway and records the objection on
`state.violations`. A stored match always renders; what is wrong with it is
data to be reported, not a reason to refuse to show it.

---

## 2. The domain model

```
User ──┬── claims ──> Player (1:1, optional — most players have no account)
       ├── owns ────> Team (1:N)
       └── creates ─> Match (1:N, the scorer)

Team ────> Player (M:N via TeamMember — a player can play for several clubs)

Match ──┬── has ──> Innings (2 for limited-overs; 3 and 4 are the super over)
        ├── has ──> MatchSquad (the XI per side, per match)
        └── has ──> BallEvent (1:N, the source of truth)

Innings ──> caches runs / wickets / ballsBowled, and holds maxWickets,
            which is sized from the squad rather than fixed at ten

BallEvent ──> references Player as batsman, non-striker, bowler, fielder
            ──> carries runsOffBat, overthrowRuns, extraRuns, totalRuns
            ──> carries isLegalDelivery, isFreeHit, battersCrossed
            ──> optionally carries shotAngle / shotDistance
```

The Drizzle schema is the real answer:
[`/apps/web/lib/db/schema.ts`](../apps/web/lib/db/schema.ts).

Two parts of this shape are load-bearing and easy to miss:

**An account and a player are different things.** A parent scoring their kid's
match is an account with no player. Every opponent is a player with no account.
`players.user_id` joins them when somebody claims themselves, one player per
account, releasable.

**The XI belongs to the match, not the club.** `match_squads` is what sizes
`maxWickets` and the bowler quota. Before it existed, a seven-a-side game out
of a twelve-player roster got ten wickets and could not end the way it was
played. Absence still means "the whole roster", so every match scored before
migration 0018 replays unchanged.

---

## 3. Deletion anonymises; it does not delete

`DELETE /api/me` is in-app under **More → Delete account** with the password
re-entered, and explained publicly at `/delete-account` — the URL Google Play's
Data Safety form asks for.

What happens:

- `users.email` → `deleted-<id>@example.com`, `display_name` → `Deleted user`,
  `anonymised_at` set and honoured on every read
- the phone number is released
- the credentials are overwritten with random bytes that are thrown away
- every session and every verification or reset token is destroyed
- the address is removed from the release-notification list
- any claim on a player is released — **the player stays**, because they are
  somebody other people have scored

Matches, players and teams all survive. History is preserved; the identity is
removed from anything user-facing. This is the pattern Lichess uses.

### Why the owner columns are `NOT NULL`

`teams.owner_id`, `matches.created_by` and `ball_events.created_by` are all
`NOT NULL` with `ON DELETE restrict`. Making them nullable was considered and
rejected, and the reasoning is worth keeping because it looks wrong at first
glance:

- It buys nothing for privacy. The column points at a row that no longer
  describes anybody.
- It would orphan a club with no way to reclaim it.
- It would answer the same question differently in three tables.

Because users are anonymised rather than deleted, `SET NULL` could never fire
anyway. The constraint is not an oversight; it is the mechanism.

---

## Performance, honestly

`ball_events` is the only table that grows fast — one row per ball bowled.
Everything else stays small regardless of user count. Roughly 250–300 bytes per
row including index overhead, about 280 rows per T20 match.

A genuinely active season — 200 weekly scorers over six months — is around
1.45M rows, roughly 400–450MB in year one. The sizing that follows from that,
and what it means for each hosting option, is in
[hosting.md](hosting.md#sizing--is-this-actually-free).

At this scale the constraint is **storage headroom, not compute**. Traffic is
bursty — weekend cricket, not constant SaaS load. Polling on the public
scorecard is one row per ball at a ten-second interval, and Drizzle queries are
sub-10ms on datasets this size. Nothing here needs a cache layer yet, and
adding one before `ball_events` is large would be optimising the wrong table.
