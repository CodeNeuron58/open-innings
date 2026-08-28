# Hosting

Where it runs, what that costs, and what was ranked and rejected — so nobody
re-researches this at 1am.

**Live at <https://openinnings.com> since 17 August 2026.** Heroku, EU
(Ireland), auto-deploying from `master`.

---

## What is running

| Piece              | Choice                          | Cost       |
| ------------------ | ------------------------------- | ---------- |
| Compute            | Heroku **Basic** dyno           | $7/mo      |
| Database           | Heroku Postgres **Essential-0** | $5/mo      |
| DNS + certificates | Cloudflare (free) + Heroku ACM  | $0         |
| Domain             | `openinnings.com`               | ~$1/mo     |
| **Total**          |                                 | **$12/mo** |

Covered by the GitHub Student Developer Pack — $13/month of credit for 24
months, so the bill is zero until roughly August 2028.

**Use Basic, never Eco.** Eco sleeps after 30 minutes, and the whole growth
loop is a stranger opening a shared scorecard link. A cold start on that link
is the one place this app cannot afford to be slow.

### Why Heroku fits this repo unusually well

The pnpm-monorepo friction that normally makes Heroku painful doesn't apply:

- `packageManager: pnpm@9.12.0` — the Node buildpack reads it and uses pnpm
- root `build` → `pnpm --filter web build`, so no monorepo buildpack is needed
- root `start` → `pnpm --filter web start`; `next start` honours `$PORT`

Heroku also compiles on a **separate build dyno with more memory than the
runtime dyno**, which removes the single biggest obstacle to the cheap
alternatives below: `next build` needs 2–4GB and gets OOM-killed on a 1GB VM.

### The cost, honestly

**There is no India region.** US (Virginia) or EU (Ireland) only, so ~150–200ms
from north-east India against ~30ms to a Mumbai or Hyderabad box. The scorer
POSTs every ball, so that lag is felt on all 240 taps of a T20.

The mitigation is **offline-first scoring, which is built** — a tap writes to
SQLite and to the screen and returns, and a drain loop handles the network. It
was needed regardless, because grounds have patchy signal or none. Hosting in
India would have let that keep being postponed.

---

## Sizing — is this actually free?

`ball_events` is the only table that grows fast. Everything else — users,
teams, players, matches, innings — stays tiny regardless of user count.

- One `ball_events` row: seven UUID columns plus small ints, enums, booleans, a
  timestamp and index overhead ≈ **250–300 bytes**
- A T20 match, both innings, extras and wickets included ≈ **280 rows** ≈ 80KB
- A genuinely active season — 200 weekly scorers over six months — is
  200 × 26 × 280 ≈ 1.45M rows ≈ **400–450MB in year one**

That number is why the free managed-Postgres tiers were rejected: Neon and
Supabase both cap around **500MB**, which this reaches at a level of activity
well short of what "1,000 users" sounds like. Essential-0's **1GB** is roughly
two years of heavy use; a self-hosted VM's 200GB is effectively unbounded at
this scale.

**Storage is the constraint, not compute.** Traffic is bursty — weekend
cricket, not constant SaaS load.

---

## Operating it

### Backups — read this before touching the schema

Essential-tier Postgres has **no rollback and no continuous protection**; those
start at Standard. So the only thing between a bad migration and a lost season
is a dump somebody remembered to take.

That matters more here than in most apps. Every figure — every career average,
every scorecard, every share card — is derived from `ball_events`. Losing it is
not losing a cache that can be rebuilt. It is losing the match.

```sh
pnpm db:backup                              # a local .dump, off Heroku entirely
heroku pg:backups:capture -a open-innings   # Heroku's own, short retention
```

Use both, for different jobs: Heroku's for "undo the last hour", the local one
for "keep a copy somewhere Heroku cannot lose". **Run one before every schema
change.** Restoring is:

```sh
pg_restore --clean --no-owner --dbname "$DATABASE_URL" backups/<file>.dump
```

The dump is custom-format, so a single table can be restored from it — which is
what you actually want when one table is wrong and the rest is fine.

### Migrations run on deploy

```
release: pnpm db:migrate
web: pnpm start
```

The `Procfile`'s release phase applies pending migrations on every deploy, and
a failed release aborts the deploy rather than leaving a half-migrated app
serving traffic.

**Never `db:seed` in a release phase.** It creates `dev@local` with a password
published in this repository. The script refuses non-local databases, but the
right answer is not to invite it.

### Two settings that are hard to undo

- **Region is Europe**, chosen at creation and unchangeable. It is the closest
  Heroku region to India.
- **Basic dyno, never Eco.** See above.

### Things that bit during setup, so they don't bite twice

- **TLS is decided in code**, not on the connection string. Heroku rewrites
  `DATABASE_URL` on credential rotation, so a hand-appended `?sslmode=require`
  silently disappears. See `lib/db/ssl.ts`.
- **Connections.** Essential-0 allows 20; `lib/db/client.ts` uses `max: 10`.
  Fine on one dyno, at the ceiling on two.
- **ACM is not automatic.** Adding a domain does not issue a certificate —
  Settings → Configure SSL → _Automatic Certificate Management_. Until then the
  domain refuses connections with no obvious cause.
- **Cloudflare records must be grey (DNS only).** Proxied records stop Heroku
  validating the domain, so the certificate never issues.
- **`NEXT_PUBLIC_*` is inlined at build time.** Changing it on a running app
  does nothing until the next rebuild — the dashboard shows the new value while
  the app serves the old one. `APP_URL` is read at runtime instead.
- **HTTP does not redirect by itself.** Next does not, and Cloudflare cannot
  while records are unproxied. Handled in `next.config.ts` off
  `x-forwarded-proto`.

---

## The fallback, and self-hosting

An Oracle Cloud **`VM.Standard.E2.1.Micro`** (`openinnings-prod`, Hyderabad)
was provisioned on 16 August and is kept running. Free, India-region, and the
reason this project is never trapped: if Heroku's latency hurts or the credit
lapses, there is already a machine to move to.

⚠️ **Don't stop it.** A stopped Always Free instance must re-acquire capacity to
start again, and Oracle reclaims genuinely idle ones after about a week.

If you are self-hosting this yourself, the whole thing is one Postgres database
and one Node process:

```sh
pnpm build && pnpm db:migrate && pnpm start
```

There is no ad server, no analytics vendor and no third-party auth in your own
build.

### On a 1GB box, build somewhere else

`pnpm build` gets OOM-killed on 1GB. `next start` only needs ~200–400MB, so:

```
CI:      pnpm install → pnpm build → upload the .next artifact
Server:  pull the artifact → pnpm start
```

This is worth doing regardless of RAM: builds become reproducible, and a broken
build fails in CI rather than halfway through a production deploy.

### Postgres tuning on 1GB

Defaults assume a much larger machine.

- `shared_buffers = 128MB`
- `work_mem = 4MB`
- `max_connections = 20` — the app pools; it does not need 100
- **Add 2GB of swap** — not for normal running, but as a cliff-edge guard so a
  spike degrades instead of getting the process killed

---

## The options, ranked

Checked August 2026. The binding constraints are: **an India region** (every
ball POSTs from a ground), **always-on** (a shared link must open instantly for
a stranger — no sleep timers), and **a real Postgres that doesn't expire**.

| Option                       | India? | Verdict                                                       |
| ---------------------------- | ------ | ------------------------------------------------------------- |
| **Heroku (Student Pack)** ✅ | No     | **Running.** $13/mo credit covers a $12 bill for 24 months    |
| **Oracle E2.1.Micro** ✅     | Yes    | **Provisioned, held as the fallback.** Free, no card          |
| Azure for Students           | Yes    | Best paid-credit fallback — $100, no card, Central India      |
| AWS Lightsail Mumbai         | Yes    | $5/mo, simple, no free tier                                   |
| Linode / Vultr / DO          | Yes    | $5–6/mo. All 1GB, so build off-server                         |
| Home machine + CF Tunnel     | Yes    | Genuinely works. Uptime risk makes it a staging box, not this |
| Google Cloud free e2-micro   | **No** | Perpetually free but US-only regions → 200ms+                 |
| Hetzner CX22                 | **No** | Best value anywhere at €3.79 — but ~130ms                     |
| Neon / Supabase free         | —      | ~500MB cap. See the sizing math above                         |
| Render / Railway / Fly       | —      | Sleep timers, expiry, or paid                                 |
| Vercel Hobby                 | —      | Non-commercial terms, serverless, and hosts no database       |

**Oracle's Ampere (A1) shapes are the trap.** Every attempt returned "Out of
capacity" in Hyderabad — the well-known ARM shortage on Always Free accounts,
not a misconfiguration. `E2.1.Micro` succeeded immediately, which is the useful
finding: the region wasn't full, only Ampere was. Try E2 before concluding a
region is full.

Three escapes that do **not** work, all suggested by Oracle's own error page:
a different availability domain (Hyderabad has exactly one), a different region
(Always Free lives only in your home region, fixed at signup), and upgrading to
Pay-As-You-Go (which removes the guarantee of never being charged).

> **The general lesson, kept because it generalises.** People run A1 retry
> loops for weeks. If a deploy is ever blocked again with a date approaching,
> set a dated line and act on it rather than waiting hopefully. _"I don't want
> to pay"_ must not quietly become _"I ran out of time"_.
