# Architecture

**Status:** v0.1 (scaffold). This document evolves as we build.

For the high-level product plan, see [`/README.md`](../README.md).

## Stack

| Concern  | Choice                                             | Reason                                                                                     |
| -------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Frontend | Next.js (App Router) + TypeScript                  | SEO matters for public scorecards; RSC + Server Actions reduce client JS                   |
| Styling  | Tailwind CSS                                       | Fast to ship, no vendor lock-in                                                            |
| Backend  | Next.js Route Handlers + Server Actions            | Single deploy unit, no separate API service                                                |
| Database | Postgres, native, self-hosted                      | No third-party dependency, no usage-based billing surprises                                |
| Auth     | Self-hosted (argon2 + session cookies)             | No Supabase, no Clerk — dropped Supabase early on to remove the vendor dependency entirely |
| ORM      | Drizzle                                            | Type-safe, SQL-first, lightweight runtime                                                  |
| Monorepo | pnpm workspace + Turbo                             | Fast installs, single `pnpm dev` for everything                                            |
| Deploy   | Self-hosted on Oracle Cloud Free Tier + Cloudflare | Free tier we control — see [deployment.md](deployment.md)                                  |
| License  | AGPL-3.0                                           | Like Lichess. Keeps the ecosystem free and open.                                           |

## The single most important decision

**`ball_events` is the source of truth. Everything else is derived.**

The scorecard, the player stats, the leaderboards — all of these are computed
from `ball_events` rows. We never store a derived number that could go out
of sync with reality.

This means:

- ✅ Undo = delete the last row, recompute
- ✅ Audit = every ball is a row, full history preserved
- ✅ Stats = query ball_events, aggregate in SQL or in code
- ⚠️ Performance = can be a concern at scale, so we cache computed
  scorecard state in `innings.runs/wickets/balls_bowled` for fast reads
- ⚠️ Complexity = every feature needs to play nicely with this pattern

**Do not optimise this away.** Resist the urge to denormalise further.

## Domain model

```
User ──┬── owns ──> Player (1:1, optional — a user can register themselves as a player)
       ├── owns ──> Team (1:N, user manages their teams)
       └── creates ──> Match (1:N, user is the scorer)

Team ──────> Player (M:N via TeamMember — a player can play for multiple teams)

Match ──┬── has ──> Innings (1:2 for limited-overs)
        ├── has ──> Scorecard (computed, cached on innings)
        ├── references ──> Tournament (nullable — friendlies don't belong to one)
        └── has ──> BallEvent (1:N, source of truth)

BallEvent ──> references ──> Player (batsman, bowler, non-striker, fielder)
            ──> references ──> Innings
            ──> has type: dot | 1 | 2 | 3 | 4 | 6 | wide | no_ball | bye | leg_bye | wicket
            ──> has extras: runsOffBat, extraRuns, totalRuns, isFreeHit, isLegalDelivery

Tournament ──> Match (1:N)
            ──> has type: round-robin | knockout | group+knockout
            ──> has Standing[] (computed)

Player ──> stats (computed): totalRuns, totalWickets, battingAvg, strikeRate,
                            bowlingAvg, economyRate, highestScore, bestBowling
```

See [`/apps/web/lib/db/schema.ts`](../apps/web/lib/db/schema.ts) for the actual
Drizzle schema.

## Cricket rule coverage

| Rule                        | Status in v0.1  |
| --------------------------- | --------------- |
| Wides                       | ✅              |
| No-balls (with free hit)    | ✅              |
| Byes / leg-byes             | ✅              |
| Wickets (all common types)  | ✅              |
| Free hit                    | ✅              |
| Retired hurt / retired out  | ✅              |
| Super Over                  | ✅              |
| Powerplay (display only)    | ⚠️              |
| DLS                         | ❌ v0.2         |
| LBW / caught-behind reviews | ❌ v0.3         |
| Multi-day / Test            | ❌ v0.3         |
| Drinks / rain delays        | ⚠️ simple timer |

**v0.1 scope = limited-overs cricket (T20, T10, ODI).** Tests deferred
because the schema for follow-on + declarations is its own project.

## Feature cuts

### v0.1 — "score a match and share it"

- Email + password auth (local, self-hosted)
- Player profiles
- Teams with squads
- Ball-by-ball scorer UI (mobile-first)
- Public scorecard page (no auth, shareable)
- Polling-based live updates

### v0.2 — "tournaments + leaderboards"

- Tournament creation + auto-fixtures
- Points table
- Leaderboards (per tournament and global)
- Match insights (wagon wheel, partnership chart)

### v0.3 — "real-time + multiplayer"

- WebSockets
- Multi-scorer conflict resolution
- Embedded YouTube/Facebook Live URLs
- Clubs (multi-user orgs)
- Super Over + DLS

### v0.4+ (parking lot)

- Native live streaming (CDN-backed)
- Video highlights
- AI insights
- Native mobile apps
- Test match support

## File map (v0.1)

The most important file is `packages/scoring/src/engine.ts`. It is a pure
function `(state, ballEvent) → newState` with comprehensive unit tests
against every MCC rule — 48 tests and counting.

| Path                             | Purpose                                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/`                  | Next.js App Router pages                                                                                                                                          |
| `apps/web/components/scorer/`    | Scorer UI (the hot path)                                                                                                                                          |
| `apps/web/components/scorecard/` | Read-only scorecard display                                                                                                                                       |
| `apps/web/lib/db/schema.ts`      | Drizzle schema (source of truth)                                                                                                                                  |
| `apps/web/lib/db/client.ts`      | Drizzle client setup                                                                                                                                              |
| `packages/scoring/src/`          | Scoring engine                                                                                                                                                    |
| `apps/web/lib/auth/`             | Local email/password auth (argon2, session cookies)                                                                                                               |
| `apps/web/lib/rate-limit.ts`     | In-process rate limiter                                                                                                                                           |
| `apps/web/supabase/migrations/`  | Hand-written SQL migrations, applied by our own runner (`scripts/migrate.ts`) — kept under this folder name for Drizzle tooling, not tied to Supabase-the-service |

## Data deletion / GDPR

If a user requests account deletion, we **anonymise** rather than hard-delete:

- `users.email` → `'deleted-' || id || '@example.com'`
- `users.display_name` → `'Deleted user'`
- `users.anonymised_at` → set
- All matches they scored remain valid (history is preserved)
- All players they created remain valid (no PII)
- All teams they owned get `owner_id` set to null (team becomes "orphan", can be reclaimed)

This is the pattern Lichess uses. We never break references to historical
match data, but the user's identity is removed from anything user-facing.

> ### ⚠️ Not implemented, and the last bullet is currently impossible
>
> **2026-08-18.** This section describes a policy, not behaviour. `anonymised_at`
> exists and every read path honours it — `getUserFromToken` and
> `authenticateUser` both refuse an anonymised user — but **nothing ever writes
> it.** There is no `DELETE /api/me`, no settings entry, and no public
> `/delete-account` page.
>
> That matters beyond tidiness: Google Play requires deletion both in-app and at
> a publicly reachable URL, and the Data Safety form asks for that URL. **It
> blocks publication.**
>
> The teams bullet also cannot be implemented as written: `teams.owner_id` is
> `NOT NULL` with `ON DELETE restrict`, so it can never be set to null. Before
> building the endpoint, pick one and change this document to match:
>
> 1. **Make the column nullable** — matches the text above, and orphan squads
>    stay reclaimable.
> 2. **Transfer ownership** to another squad member — needs a rule for who, and
>    for a squad of one.
> 3. **Delete the squad** with the account — simplest, and destroys other
>    people's fixtures, which is the reason we anonymise rather than delete
>    everywhere else.
>
> Tracked as the first item in [`checklist.md`](../checklist.md) §1.

## Performance considerations

`ball_events` is the only table that grows fast — one row per ball bowled,
everything else (users, teams, players, matches) is small. Roughly 250-300
bytes/row including index overhead, ~280 rows per T20 match. See
[deployment.md](deployment.md) for the full sizing math against our
self-hosted Postgres's free storage — the honest constraint at this scale
is storage headroom, not compute.

For 0–1k users (v0.1 target):

- One Oracle Cloud Free Tier VM (app + Postgres together) is plenty
- Polling on public scorecard is fine (10s interval, 1 row per ball)
- Drizzle queries are sub-10ms on small datasets
- No caching layer needed

For 1k–10k users (v0.2–v0.3):

- Still likely fits the free VM; revisit if `ball_events` approaches the
  200GB free storage ceiling (it won't, at this scale — see the math in
  deployment.md) or if CPU becomes the bottleneck under concurrent scoring
- Add Redis for hot match state if polling load becomes noticeable
- Cache leaderboards in a materialized view, refresh every 5 min

For 10k+ users (later):

- A paid VM tier, or splitting app and DB onto separate instances
- Read replicas, CDN for static content
- Consider partitioning `ball_events` by `match_id`
