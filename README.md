# 🏏 Open Innings

> Ball-by-ball cricket scoring for club, league, box and gully cricket.
> Open source, AGPL-3.0 — **the person doing the scoring never pays and never
> sees an ad.**

[![CI](https://github.com/CodeNeuron58/open-innings/actions/workflows/ci.yml/badge.svg)](https://github.com/CodeNeuron58/open-innings/actions/workflows/ci.yml)
[![Licence: AGPL-3.0](https://img.shields.io/badge/licence-AGPL--3.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-20%2B-brightgreen.svg)](.nvmrc)
[![Tests](https://img.shields.io/badge/tests-227%20unit%20%2B%20264%20smoke-success.svg)](#testing)

[Quick start](#quick-start) · [The engine](#the-engine) · [Cricket laws](#which-laws-are-enforced) · [API](#the-api) · [Architecture](docs/architecture.md) · [Contributing](CONTRIBUTING.md)

---

## Why this exists

Every amateur cricketer in India plays for years and has **no record of any of
it**. Runs vanish into paper scorebooks. The apps that would keep them charge
for the privilege, and they charge the one person doing three hours of work.

Open Innings inverts that. Scoring is free, forever, with no ads on the scoring
screen. The people _reading_ a scorecard are the audience, and that is where
the app earns.

CricHeroes owns this market and paywalls aggressively. We do not beat them on
features — we beat them on being genuinely free to the person holding the
phone, and on being forkable by any club that wants to run its own copy.

---

## What works today

The app runs end to end on real hardware: sign up, add players, build squads,
create a match, score a full innings ball by ball, and share the result. The
API is live at **`openinnings.com`**.

### Scoring

|                               |                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pure engine**               | `applyBall(state, event) → newState`. No I/O, no framework. Runs unchanged in the browser and on the phone.                                 |
| **Every delivery type**       | Dot, 1–6 (five included), wide, no-ball, bye, leg-bye, and 14 dismissal types.                                                              |
| **One-handed keypad**         | 0–6, W and undo always on screen. Extras are armed modifiers — arm a wide, tap the runs.                                                    |
| **Extras with variable runs** | Wide/bye/leg-bye 1–6, no-ball 1–7, split correctly between the bat and the extras column.                                                   |
| **Free hit**                  | Granted by a no-ball, survives an intervening wide, and carries a no-ball's dismissals — not just a run out.                                |
| **Strike rotation**           | Crossing and the change of ends **compose**, so a single off the last ball keeps the striker on strike.                                     |
| **Maidens**                   | Runs off the bat only. Byes do not break one; a wicket maiden counts.                                                                       |
| **Mandatory sheets**          | Bowler change at the end of an over, next batter after a wicket. No dismiss button — the engine cannot validate the next ball without them. |
| **Bowler quota**              | A playing condition, per match, enforced by the engine. Off by default where the side could not cover the innings under it.                 |
| **Squad-size-aware innings**  | A six-a-side team is all out at five. Ten wickets is not hardcoded.                                                                         |
| **Super Over**                | Innings 3 and 4 — two wickets, one over, and only when the scores are level.                                                                |
| **Innings break & result**    | Target, chase, run rate, required rate, and the result line.                                                                                |
| **Abandon**                   | Rain, a dispute, or a match started by mistake. Recorded as a no result, not faked as a tie.                                                |
| **Exact undo**                | Transactional. Every figure is derived, so removing a ball corrects everything downstream of it.                                            |
| **Match editing**             | Title, venue, format, and the innings length — the last one replays the match to re-decide what the deliveries mean.                        |

### Identity — the career record

|                           |                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Public career page**    | `/p/<id>`, no account needed.                                                                             |
| **Career + season split** | The newest season the player actually appears in, not the calendar year.                                  |
| **Batting**               | Runs, innings, not-outs, average, strike rate, high score (with the asterisk), 4s, 6s, fifties, hundreds. |
| **Bowling**               | Wickets, best figures, economy, average, strike rate, five-fors.                                          |
| **Fielding**              | Catches, run-outs, stumpings.                                                                             |
| **Appearances**           | Counted from any role on the ball log — a specialist fielder has played.                                  |
| **Form**                  | Last five innings at a glance.                                                                            |
| **Milestones**            | Dated in appearances, not days: "eighth fifty, two matches ago".                                          |
| **Claim your player**     | An account says which player on the field it is. One per account, releasable.                             |

### Sharing — the growth loop

|                           |                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------- |
| **Public scorecard**      | `/m/<id>`, no app and no account. Refreshes itself while the match is live.           |
| **Watching count**        | Presence, not followers — how many people are reading the scorecard right now.        |
| **Match card**            | 1200×630 for a link preview, 1080² for a status or a post.                            |
| **Per-player match card** | One match, twenty-two shareable cards.                                                |
| **Career card**           | A player's record as an image.                                                        |
| **Club page**             | `/c/<id>` — squad, last ten results, career leaders.                                  |
| **Scorebook export**      | CSV and JSON of the ball log itself, not the conclusions. Spreadsheet-injection safe. |

### Platform

- **REST API** — 25 routes, 35 handlers, bearer-token auth. 264 smoke checks.
- **Android app** — Expo / React Native, 28 screens, works on device.
- **Marketing site** — Next.js, statically rendered.
- **Android App Links** — a shared scorecard opens the app, not a browser.
- **Guest mode** — open any shared link without an account. Reading is free; keeping a record needs one.

---

## The engine

`packages/scoring/src/engine.ts` is a pure function:

```
applyBall(matchState, ballEvent) → newMatchState
```

No I/O, no framework, no clock, no randomness. **Every other number in the
product** — the live score, the scorecard, career averages, the club page, the
share cards — is derived by replaying ball events through it.

That is why a correction anywhere fixes everything downstream, why a UI bug is
a presentation problem rather than data corruption, and why the same code runs
on the server and on the phone.

Its rule sets are **exported rather than restated**. Which dismissals credit
the bowler is Law 25, and the SQL that computes career figures imports
`BOWLER_CREDITED_WICKETS` instead of retyping the list. The same goes for what
counts as a ball faced and what is charged to a bowler's analysis. There is one
definition of each, and it lives in `rules.ts`.

### Validate on write, tolerate on read

Replay runs on every read, so a rule tightened today would otherwise be applied
retroactively to deliveries recorded before it existed — and a match containing
one would stop rendering.

So `applyBall` is strict when a scorer records a delivery, and **lenient when
the ball log is read back**: a stored delivery the current rules refuse is
still applied, and the objection is recorded on `state.violations`.
`pnpm db:verify` replays the whole database and reports them.

A shared scorecard never breaks because the laws improved.

---

## Which laws are enforced

Cricket is a game of edge cases, and most scoring apps quietly get them wrong.
These are checked by the engine and covered by tests.

| Law     | Rule                                                                              |     |
| ------- | --------------------------------------------------------------------------------- | --- |
| 21      | Off a no-ball: only run out, obstructing the field, or hit the ball twice         | ✅  |
| 21.18   | A free hit carries a no-ball's dismissals, and survives an intervening wide       | ✅  |
| 22.2    | A wide is not a ball faced; its penalty is awarded, not run                       | ✅  |
| 22.6    | Off a wide: only stumped, run out, hit wicket, or obstructing the field           | ✅  |
| 23 / 24 | Byes and leg-byes are balls faced, and are not charged to the bowler              | ✅  |
| 25      | Five dismissals credit a bowler — bowled, caught, lbw, stumped, hit wicket        | ✅  |
| 16.2    | No bowler bowls two consecutive overs                                             | ✅  |
| 17.4    | The bowler may not change mid-over, except when they cannot continue              | ✅  |
| 18.11   | A new batter after a catch takes strike (2017 Code)                               | ✅  |
| 27      | Crossing and the change of ends compose                                           | ✅  |
| —       | A dismissal names a player who is actually at the crease                          | ✅  |
| —       | A dismissed batter never returns; a retired hurt one may, at the fall of a wicket | ✅  |
| —       | Nobody bats and bowls, or fields their own dismissal, on the same delivery        | ✅  |
| —       | Maidens, partnerships, fall of wickets, super overs                               | ✅  |

**Not yet modelled:** penalty runs (Law 41), short runs (18.5), dead ball (20),
DLS, powerplays, substitutes and impact players, balls-per-over other than six,
and a repeated super over. See [Roadmap](#roadmap).

---

## How it earns

The scorer is the labour; the viewers are the audience. That distinction
decides every monetisation choice:

- **No ad ever appears on a scoring screen.** Not on the free plan, not ever.
  Mis-tapping a ball because an ad loaded under your thumb is how a scorebook
  goes wrong.
- Ads run on **scorecards and share screens**, where people are reading rather
  than tapping.
- A **supporter subscription** removes them. It unlocks no features, because no
  feature is ever gated.
- **Self-host and pay nothing** — there is no ad server in your own build.

---

## Quick start

Postgres 16+ and pnpm 9+ required. Full instructions in [SETUP.md](SETUP.md).

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # defaults assume local Postgres
pnpm db:migrate
pnpm db:seed                                    # dev only — see the warning below
pnpm dev                                        # http://localhost:3000
```

For the Android app:

```bash
cd apps/mobile
pnpm start        # needs a dev build — Expo Go cannot run this project
```

> **`pnpm db:seed` creates `dev@local` / `devpassword123`.** That password is
> published in this repository. Never run it against anything but a local
> database. Production gets `pnpm db:migrate` only.

### Everyday commands

| Command                        | What it does                                              |
| ------------------------------ | --------------------------------------------------------- |
| `pnpm dev`                     | Next.js dev server                                        |
| `pnpm test`                    | 227 unit tests                                            |
| `pnpm typecheck` · `pnpm lint` | Four packages each                                        |
| `pnpm db:migrate`              | Apply pending SQL migrations                              |
| `pnpm db:verify`               | Replay every innings and report anything the rules refuse |
| `pnpm db:backup`               | `pg_dump` to `backups/`                                   |
| `pnpm smoke:api`               | 194 checks against a running server                       |

---

## The API

25 route files, 35 handlers. Authentication is a bearer token or a session
cookie — the same opaque token either way, so revoking a session signs you out
everywhere.

| Group       | Routes                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**    | `signup` · `login` · `logout` · `session`                                                                                                         |
| **Matches** | list/create · get/update/delete · `abandon` · `ball` (record/undo) · `innings` (next/end) · `scorer` · `summary` · `card` · `export` · `watching` |
| **Players** | list/create · `[id]/stats` · `briefs` · `me/player`                                                                                               |
| **Teams**   | list/create · get/update · `members` (add/update/remove) · `[id]/club`                                                                            |
| **Other**   | `health` · `notify` · `.well-known/assetlinks.json`                                                                                               |

**Public, no credential:** the scorecard, career, club, summary, card and
export endpoints. A scorecard nobody can open is not a scorecard.

Request and response shapes live in `packages/shared`, so a field renamed on
the server breaks compilation in the app rather than at runtime on somebody's
phone.

---

## Project structure

```
open-innings/
├── apps/
│   ├── web/                  # Next.js — REST API, public pages, marketing site
│   │   ├── app/api/          # 25 route files, 35 handlers
│   │   ├── app/m,p,c/        # Public scorecard, career, club + share cards
│   │   ├── lib/db/           # Drizzle schema, queries, career SQL
│   │   ├── lib/services/     # Transport-free business logic
│   │   ├── scripts/          # migrate, seed, backup, verify, 3 smoke suites
│   │   └── supabase/         # 11 SQL migrations (path kept for Drizzle tooling)
│   └── mobile/               # Expo / React Native — the scorer, 28 screens
├── packages/
│   ├── scoring/              # The engine. Pure TS, no I/O. 146 tests.
│   └── shared/               # Zod schemas + response types. 27 tests.
└── docs/                     # Architecture, cricket laws, hosting, wiring
```

Both packages ship raw TypeScript with no build step, so Next.js and Metro
consume the same source.

---

## Tech

**Web** — Next.js 16 (App Router), React 19, Tailwind v3, Drizzle ORM,
Postgres, `postgres.js`
**Mobile** — Expo SDK 57, React Native 0.86, Expo Router, NativeWind v4
**Shared** — TypeScript, Zod, Vitest, fast-check
**Auth** — email + password, argon2id, server-side sessions

---

## Testing

```bash
pnpm test          # 227 unit tests
pnpm typecheck     # four packages
pnpm lint
pnpm db:verify     # replay the whole database against the current rules
pnpm smoke:api     # 194 checks against a running server, bearer auth only
```

**227 unit tests** — 146 in the engine, 27 on the shared schemas, 54 on the
web services. **264 smoke checks** across three suites that drive the real HTTP
surface against a real database.

The engine is covered two ways, deliberately:

- **Example tests** for the cases somebody thought of.
- **Property tests** (`fast-check`) for the ones nobody did — laws asserted
  over _any_ sequence of deliveries, shrinking a failure to the smallest input
  that still breaks. The property file restates the Laws rather than importing
  the engine's own rule sets, because a test that asks the code under test what
  the rule is will pass however wrong the rule is.

`smoke:api` is self-cleaning and safe to run repeatedly. **`smoke:score` and
`smoke:p1` are destructive** — they wipe ball events. Local databases only.

---

## Roadmap

Honest about what is not built. None of it is hidden behind a paywall, because
nothing is.

**Next**

- Correcting any ball, not only the last one
- Portable player identity across clubs
- Penalty runs, short runs, dead ball
- Leaderboards and honours boards
- Push notifications

**Later**

- Offline-first scoring — queue deliveries, sync on reconnect
- Tournaments and multi-scorer clubs
- DLS, powerplays, substitutes and impact players
- Balls-per-over other than six (The Hundred, some box formats)
- Wagon wheel, pitch map, run-progression charts

**Not planned**

- iOS — AGPL-3.0 is incompatible with App Store terms, the same reason VLC and
  GNU Go are not there. You can still build from source for your own device.
- Fantasy or prediction games, live streaming, paywalling the scorer.

---

## Contributing

Code, design, translations, rule-testing and bug reports all welcome. The most
useful contribution is scoring a real match and filing an honest issue about
the ball it got wrong.

- [Report a bug](https://github.com/CodeNeuron58/open-innings/issues)
- [Contributing guide](CONTRIBUTING.md) · [Code of conduct](CODE_OF_CONDUCT.md)

If your league scores a wide differently, say so — that becomes a toggle rather
than a fork.

**Working on the engine?** Add the test first. A rule without one does not
ship, and the property tests are the place for anything that should hold over
every possible innings.

---

## Self-hosting

The whole thing runs on one Postgres database and one Node process. There is no
ad server, no analytics vendor and no third-party auth in your own build.

```bash
pnpm build && pnpm db:migrate && pnpm start
```

`Procfile` and the root `build`/`start` scripts are set up for a
platform-as-a-service deploy; `docs/hosting.md` covers what was tried and what
it costs.

---

## Licence

[AGPL-3.0](LICENSE). Fork it, self-host it, run your league's own instance. If
you run a modified version publicly, publish your changes.

---

**Built for club cricket. Owned by everyone who plays it.**
