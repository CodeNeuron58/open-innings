# Hosting — where it runs, and why

`deployment.md` is the **original plan** (one VM, Postgres alongside,
Cloudflare in front). This file is **where hosting actually landed**: what was
tried, what it costs, and every option ranked so none of it gets
re-researched.

**Status: 🟢 DECIDED — deploying to Heroku.**
Covered by the GitHub Student Developer Pack: **$13/month for 24 months**,
against a $12/month bill (Basic dyno $7 + Postgres Essential-0 $5).

An Oracle `E2.1.Micro` (`openinnings-prod`, Hyderabad) was provisioned the
same day and is **kept as the fallback** — free, India-region, and the place
to go if Heroku's latency proves intolerable.

**Last updated: 2026-08-16**

The deploy is the critical path. Everything downstream is queued behind it:

```
deploy → preview APK with a reachable API → closed testing
       → 12 testers × 14 days (unskippable) → apply → ~7 day review → live
```

Working back from the Sept 30 deadline, **the deploy has to land by ~Aug 30.**

---

## The Oracle capacity story — resolved, kept for reference

Oracle returned **"Out of capacity for shape VM.Standard.A1.Flex in
availability domain AD-1"** on every attempt at the Ampere shape.

This is the well-known Ampere shortage on Always Free accounts, not a
misconfiguration. Oracle oversubscribes ARM capacity in popular regions and
Hyderabad is one of them. **`E2.1.Micro` succeeded immediately**, which is the
useful finding: the region wasn't full, only Ampere was.

### Attempt log

| Date       | Shape                         | Result             |
| ---------- | ----------------------------- | ------------------ |
| 2026-08-16 | A1.Flex, 2 OCPU / 12 GB       | Out of capacity    |
| 2026-08-16 | A1.Flex, 1 OCPU / 6 GB        | Out of capacity    |
| 2026-08-16 | **E2.1.Micro, 1 OCPU / 1 GB** | ✅ **Provisioned** |

**Conclusion: the shortage is Ampere-specific, not regional.** Hyderabad has
capacity; A1 is simply oversubscribed. Anyone hitting this should try E2
before concluding the region is full or reaching for a card.

_Add a row per attempt. If a pattern shows (e.g. early morning IST works),
that's worth knowing._

### Escapes that do NOT work — don't waste time on these

- **"Try a different availability domain"** (Oracle's own suggestion) —
  Hyderabad has exactly **one** AD. There is nothing to switch to.
- **Switching region** — Always Free resources only exist in the account's
  **home region**, fixed permanently at signup. Hyderabad is now permanent.
- **Upgrading to Pay-As-You-Go** — would unlock capacity priority, but the
  whole point is not paying, and PAYG removes the guarantee of never being
  charged.

---

## Option 0 — Heroku ✅ CHOSEN, 2026-08-16

**$0 for 24 months via the GitHub Student Developer Pack.**

Missed on the first pass because Heroku's public free tier died in 2022 — but
the Student Pack offer is live and covers the whole bill:

| Piece                     | Cost                            |
| ------------------------- | ------------------------------- |
| Basic dyno (never sleeps) | $7/mo                           |
| Postgres Essential-0      | $5/mo                           |
| **Total**                 | **$12/mo** against a $13 credit |

Use the **Basic** dyno, never Eco ($5) — Eco sleeps after 30 minutes, and a
shared scorecard link that cold-starts for a stranger breaks the growth loop.

### Why it fits this repo unusually well

The pnpm-monorepo friction that normally makes Heroku painful doesn't apply:

- `packageManager: pnpm@9.12.0` — the Node buildpack reads it and uses pnpm
- root `build` → `pnpm --filter web build` — no monorepo buildpack needed
- root `start` → `pnpm --filter web start`; `next start` honours `$PORT`

**Heroku also builds on a separate build dyno with more memory than the
runtime dyno**, which means the "build off-server in CI" work below becomes
unnecessary. That was the largest remaining task.

### What it removes

SSH, swap, Postgres install and tuning, systemd, Cloudflare Tunnel, backup
scripting, and the CI build pipeline. Roughly 4–6 hours of unfamiliar ops
collapses to about two, then `git push heroku main` forever after.

### The cost, honestly

**No India region** — US (Virginia) or EU (Ireland) only, so ~150–200ms from
Tripura against ~30ms to Hyderabad. The scorer POSTs every ball and waits for
the replayed state, so that lag is felt on all 240 taps.

**The mitigation is offline-first scoring (Tier 3 in `FEATURES.md`), which is
needed regardless** — grounds have patchy signal or none, and today a dropped
connection mid-over stops scoring dead. Hosting in Hyderabad would let that
keep being postponed. Heroku forces the issue, and the resulting app is
better at a real ground either way.

**This raises Tier 3's priority from "if the schedule allows" to "the thing
that makes the deploy choice correct."**

### Known gotchas

- **SSL** — Heroku sets `DATABASE_URL` with no SSL parameters, but its
  Postgres requires TLS with a self-signed certificate. Expect the first
  connection to fail; fix with `?sslmode=require`, or `no-verify` if
  certificate verification is the complaint. Note Heroku **rotates**
  `DATABASE_URL`, so don't hardcode a hand-edited copy.
- **Connections** — Essential-0 allows 20; `lib/db/client.ts` uses `max: 10`.
  Fine on one dyno, at the ceiling on two.
- **Storage** — Essential-0 caps at 1 GB. Per the sizing math in
  `deployment.md` that's roughly two years of heavy use.
- **Backups** — Essential tiers have no rollback/continuous protection.
  A scheduled `pg_dump` is still needed.
- **Migrations** — use a Procfile `release:` phase so they run on deploy:
  ```
  release: pnpm db:migrate
  web: pnpm start
  ```
  **Never `db:seed`** — it publishes `dev@local` / `devpassword123`.
- **Credit expiry** — 24 months, so ~Aug 2028. Irrelevant to this hackathon,
  but not forever. Oracle remains the exit.

---

## Option A — `E2.1.Micro` — provisioned, held as fallback

**Free. One instance provisioned 2026-08-16, kept running. A second is still
available if it's ever needed — that escape hatch costs nothing.**

Not the deploy target as of the Heroku decision above, but the reason the
project is never trapped: if Heroku's latency hurts, or the credit lapses,
this is a free India-region machine already sitting there.

⚠️ **Don't click Stop on it.** A stopped instance must re-acquire capacity to
start again, and A1 capacity failed twice on the day it was created. Also note
Oracle reclaims genuinely idle Always Free instances after ~7 days once the
Free Trial ends — if that happens, E2 had capacity easily, so recreating it is
not the ordeal A1 was.

`VM.Standard.E2.1.Micro` is the _other_ Always Free shape: **AMD x86, 1 OCPU,
1 GB RAM, and you get two of them.** It's the older shape, far less contended
than Ampere, so capacity is usually available when A1 is not.

The reason this wasn't the first choice is 1 GB of RAM — `next build` needs
2–4 GB and gets OOM-killed at 1 GB. **That objection dissolves entirely if the
build happens off-server** (see "Build off-server" below), because `next start`
only needs ~200–400 MB.

**Two instances also means the memory pressure can be split:**

| Instance | Runs                  | Typical RSS |
| -------- | --------------------- | ----------- |
| `oi-app` | Node, `next start`    | ~200–400 MB |
| `oi-db`  | Postgres, tuned small | ~200–400 MB |

Each fits in 1 GB with room to spare. They talk over the VCN's private
network, so the database is never exposed to the internet — which is a
security improvement over the single-VM plan, not a compromise.

**Trade-offs, honestly:** E2.1.Micro is slow and burstable, with 480 Mbps
networking. For bursty weekend cricket traffic that's fine. It is genuinely
worse than 2 OCPU / 12 GB of Ampere — but it exists, and Ampere doesn't.

x86 instead of ARM is a mild bonus: fewer native-module surprises.

---

## Option B — Keep retrying A1

**Free. Unbounded wait. Do this in the background, never as the plan.**

Capacity frees up unpredictably as other tenants release instances.

- Try **1 OCPU / 6 GB** before 2 OCPU / 12 GB — smaller asks draw from a
  different slice and succeed more often.
- Off-peak hours (IST late night / early morning) anecdotally do better.
- It can be scripted against the OCI CLI, but a manual attempt each day costs
  a minute and avoids building a retry harness we'd throw away.

**The trap:** people run retry loops for _weeks_. That is the single most
likely way this hackathon gets lost — not to a hard problem, but to waiting
politely for a queue with no ETA.

---

## Option C — Pay for a small VM

**~₹500/month. The guaranteed-to-work option. Deliberately last.**

Only if A and B have both failed by the cutoff below.

| Provider     | Region              | Spec          | Cost  |
| ------------ | ------------------- | ------------- | ----- |
| Linode       | Mumbai              | 1 vCPU / 1 GB | $5/mo |
| Vultr        | Bangalore or Mumbai | 1 vCPU / 1 GB | $6/mo |
| DigitalOcean | Bangalore           | 1 vCPU / 1 GB | $6/mo |

An India region is not optional — every ball POSTs from a ground, so a
Europe/US box would add ~150 ms to each tap.

Note these are all **1 GB**, same as `E2.1.Micro`. Paying doesn't remove the
need to build off-server; it only removes the capacity lottery. Roughly
₹1,000 total to reach Sept 30.

---

## Appendix — the full option map

Checked 2026-08-16. Recorded so nobody re-researches this at 1am.

The binding constraints are: **an India-region host** (every ball POSTs from a
ground; ~150ms+ each way is felt), **always-on** (a shared scorecard link must
open instantly for someone who has never heard of us — no sleep timers), and
**a real Postgres that doesn't expire**.

| Option                        | India? | Verdict                                                     |
| ----------------------------- | ------ | ----------------------------------------------------------- |
| **Oracle E2.1.Micro** ✅      | Yes    | **Taken.** Free forever, no card, second one in hand        |
| **Azure for Students**        | Yes    | **Best fallback** — $100, no card, Central India. See below |
| Second Oracle E2.1.Micro      | Yes    | Free. The escape hatch if 1 GB gets tight                   |
| Home machine + CF Tunnel      | Yes    | Free and viable, but uptime risk. See below                 |
| AWS Lightsail Mumbai          | Yes    | $5/mo. Simple, no free tier                                 |
| Linode / Vultr / DO           | Yes    | $5–6/mo — Option C above                                    |
| Google Cloud free e2-micro    | **No** | Genuinely always-free, but US-only regions → ~200ms+        |
| Hetzner CX22                  | **No** | €3.79 for 2 vCPU/4 GB, best value anywhere — but ~130ms     |
| Koyeb free                    | Partly | Singapore ~60–80ms; tiny free tier, no Postgres             |
| **DigitalOcean student $200** | —      | ☠️ **DEAD** — DO left the Student Pack on 2026-08-01        |
| AWS / Azure standard free     | Yes    | 12 months only, then billed. A trap, not a tier             |
| Render / Railway / Fly        | —      | Sleep timers, expiry, or paid. See `deployment.md`          |
| Vercel / Netlify              | —      | Non-commercial terms + serverless. See `deployment.md`      |

**Google Cloud's free e2-micro** deserves a note because it's otherwise the
closest thing to Oracle's offer — genuinely perpetual, 1 vCPU / 1 GB, 30 GB
disk. It is free **only** in `us-west1`, `us-central1` and `us-east1`. Launch
it anywhere else and you're billed at full rate. For an app where every ball
bowled is a POST from a ground in India, that's disqualifying on latency
alone.

### Azure for Students — the best fallback

**$100 credit, no credit card required, renewable while enrolled.** Azure has
**Central India** and **South India** regions, so latency is fine.

A `B1s` VM (1 vCPU / 1 GB) runs roughly $8/month, so $100 is about a year —
comfortably past Sept 30. Requires being **18+**; the 13–17 variant exists but
excludes VMs.

Claim it via the GitHub Student Developer Pack. Worth registering for the Pack
regardless — it's free and the other perks are real.

### Home machine + Cloudflare Tunnel — free, and not a joke

A spare laptop or Pi at home, with a Cloudflare Tunnel, genuinely works. The
tunnel dials **out**, so there's no port forwarding, no static IP, and no
router configuration — the same mechanism we're already using on the VM.

**The risk is uptime, and it's a real one here.** Closed testing needs 12
testers opted in for **14 consecutive days**. A power cut or a rebooted router
during that window doesn't just look bad, it can cost testers. In Tripura
that's not a hypothetical.

Fine as a dev or staging box. Not what closed testing should depend on.

---

## Build off-server — _not_ needed on Heroku, required on the fallback

**Skip this section unless falling back to Oracle.** Heroku compiles on a
separate build dyno with more memory than the runtime dyno, so `next build`
works there without any of the below. That is a large part of why it won.

On a 1 GB VM, `pnpm build` on the server gets OOM-killed. **Don't do it.**

```
GitHub Actions:  pnpm install → pnpm build → upload .next artifact
Server:          pull artifact → pnpm start
```

Why it matters beyond RAM:

- A 1 GB box becomes sufficient, which makes the free options viable at all
- Deploys stop depending on the server having spare memory
- Builds become reproducible, and a broken build fails in CI instead of
  halfway through a production deploy
- Deploy time drops from minutes to seconds

This is standard practice regardless of hosting, and it's the single change
that makes the cheap path work.

## Postgres on 1 GB — Oracle fallback only

**Not applicable on Heroku**, where Postgres is a managed add-on. Kept for the
fallback path.

Defaults assume a much larger machine. Tune before it OOMs:

- `shared_buffers = 128MB`
- `work_mem = 4MB`
- `max_connections = 20` — the app pools; it doesn't need 100
- **Add 2 GB of swap.** Not for normal running — as a cliff-edge guard so a
  spike degrades instead of getting the process killed.

Per `deployment.md`'s sizing math, `ball_events` reaches only ~400–450 MB
after a full year of heavy use, so **storage is not the constraint. RAM is.**

---

## Decision point — ✅ resolved 2026-08-16, no longer live

The original line was: _if there is still no working server on 2026-08-25,
pay for Option C_ — on the reasoning that being wrong about paying costs
₹1,000, while being wrong about waiting costs the entire hackathon.

**It never came due.** Two independent free paths exist: Heroku for 24 months
on the Student Pack, and Oracle indefinitely.

The reasoning is kept because it generalises. If the deploy is ever blocked
again with the Sept 30 date approaching, set a dated line, and act on it
rather than waiting hopefully. _"I don't want to pay"_ must not quietly become
_"I ran out of time."_

---

## Next actions

Heroku path. Everything below is roughly two hours.

- [x] Try `E2.1.Micro` — worked first time, 2026-08-16 (kept as fallback)
- [x] Decide the host — **Heroku**, on the Student Pack credit
- [ ] Claim the Heroku offer via the GitHub Student Developer Pack
- [ ] Create the app, region **EU (Ireland)** — closer to India than Virginia
- [ ] Add the **Postgres Essential-0** add-on ($5) and a **Basic** dyno ($7).
      **Not Eco** — Eco sleeps, and a cold-starting scorecard link breaks the
      share loop.
- [ ] `Procfile` with a `release:` phase running `pnpm db:migrate`
- [ ] Fix the SSL connection string (expect this to fail once first)
- [ ] `pnpm smoke:api` against the deployed URL — it's self-contained and safe
- [ ] Point `openinnings.com` at the app; confirm `/app-ads.txt` serves
- [ ] Set `EXPO_PUBLIC_API_URL` in the preview + production EAS profiles
- [ ] Schedule a `pg_dump` — Essential tiers have no rollback

**Option C (paying) and the Aug 25 decision point are now moot.** Two
independent free paths exist: Heroku for 24 months, Oracle indefinitely.
