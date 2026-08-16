# Deployment

**Status: not deployed yet.** This documents the decided plan — deployment
happens once the app is further along and tested locally, not before.

## The decision

**Self-host the app and Postgres together on one Oracle Cloud Free Tier
VM, with Cloudflare in front.** This matches how the code is already
built: a single long-running Node process with pooled `postgres.js`
connections (`apps/web/lib/db/client.ts`), not a serverless architecture.

| Piece        | Choice                                                  |
| ------------ | ------------------------------------------------------- |
| Compute + DB | Oracle Cloud Always Free — Ampere A1 VM                 |
| In front     | Cloudflare (free) — CDN, DDoS protection, SSL           |
| Domain       | Whatever registrar — the one real recurring cost        |
| App process  | `pnpm build && pnpm start`, kept alive (systemd or pm2) |
| DB           | Postgres running on the same VM, not a managed service  |

## Why not the obvious alternatives

- **Vercel free (Hobby) tier** — explicitly restricted to personal,
  non-commercial use by a single developer. **Updated 2026-08-16: this is
  no longer a gray area.** The project now serves AdMob inventory and sells
  a supporter tier, which is commercial by any reading of those terms. A
  suspension mid-hackathon would be unrecoverable. Independent of that,
  Hobby is serverless: this app is a long-running Node process with pooled
  `postgres.js` connections, so it would need a connection pooler bolted on,
  and Vercel hosts no database anyway.
- **Render / Railway / Fly free tiers** — Render's free web services sleep
  after 15 minutes and cold-start in ~50s, which breaks the one thing that
  has to be instant: a shared scorecard link opened by someone who has never
  heard of us. Render's free Postgres also expires outright. Railway's free
  tier is gone (trial credit, then paid); Fly's was withdrawn in 2024.
  See `hosting.md` for the full comparison.
- **Neon / Supabase free-tier Postgres** — both cap free storage around
  500MB, which this app's own growth curve reaches well before "1,000
  users" sounds like it should (see sizing math below). Supabase also
  pauses projects after 7 days of inactivity, which would break old
  shared scorecard links — a bad fit for a "share this link, it works
  forever" product. (This project already dropped Supabase once, for
  unrelated reasons — this reconfirms that call.)

## Oracle's free tier, and the one caveat worth knowing

As of writing, Oracle Cloud's Always Free Ampere A1 allowance is
**2 OCPU / 12GB RAM** (usable as one VM or split into two), 200GB block
storage, and 10TB/month egress. Storage and egress are unchanged from
before; the compute allowance was **cut from 4 OCPU/24GB in June 2026,
with no announcement** — people found out when instances got shut down.

Practical takeaway: the free tier is generous enough for this app at real
scale (see below), but don't design around the exact current numbers
holding forever. If Oracle cuts again, the fallback is a small paid VM
(a few dollars a month) or Neon for just the database — not a rewrite,
since the app's architecture doesn't change either way.

## Sizing math — is 1,000 users actually free?

`ball_events` is the only table that grows fast — one row per ball
bowled. Everything else (users, teams, players, matches, innings) stays
tiny regardless of user count.

- Each `ball_events` row: 7 UUID columns + several small ints/enums/
  booleans + a timestamp + index overhead ≈ **250-300 bytes**.
- A T20 match (both innings, wides/no-balls/wickets included) ≈ **280
  rows** ≈ ~75-85KB.
- A genuinely active scenario — 200 regular weekly scorers over a 6-month
  season — is roughly 200 × 26 × 280 ≈ 1.45M rows ≈ **~400-450MB in year
  one**.

That number matters because it's already close to Neon's/Supabase's free
500MB cap — at a level of activity well short of "1,000 users" by most
readings of that phrase. Against Oracle's **200GB** free storage, the same
math has multiple years of headroom even at much heavier adoption than
that. Compute is a non-issue either way — this app's traffic is bursty
(weekend cricket, not constant SaaS load) and 2 OCPU/12GB comfortably
handles far more concurrent scoring sessions than 1,000 total users
implies at once.

**Conclusion: yes, self-hosted on Oracle's free tier, 1,000 users costs
nothing but the domain — as long as the DB lives on the VM's own storage,
not a managed free-tier Postgres service.**

## Open questions for when deployment actually happens

- Exact process manager (systemd vs. pm2) and reverse proxy setup
  (Caddy, nginx, or a Cloudflare Tunnel to skip exposing a port directly)
- Backup strategy for the self-hosted Postgres (this is the one thing a
  managed DB gives you for free that self-hosting doesn't — needs a plan,
  e.g. a cron'd `pg_dump` to object storage)
- CI/CD: does a push to `main` auto-deploy, or is it manual for now
- Monitoring/alerting for the VM (even something minimal — free-tier
  uptime checks)

None of this blocks continued local development — fill it in when
deployment is actually next.
