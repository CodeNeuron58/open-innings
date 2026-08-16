# 🏏 Open Innings

> Ball-by-ball cricket scoring for club, league, box and gully cricket.
> Open source, AGPL-3.0 — **the person doing the scoring never pays and never
> sees an ad.**

[Quick start](#quick-start) · [Setup guide](SETUP.md) · [Architecture](docs/architecture.md) · [Hosting](docs/hosting.md) · [Contributing](CONTRIBUTING.md)

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

## What works today

The app runs end to end on real hardware: sign up, add players, build squads,
create a match, score a full innings ball by ball, and share the result.

| Area         | Feature                                                                      | Status                             |
| ------------ | ---------------------------------------------------------------------------- | ---------------------------------- |
| **Scoring**  | Ball-by-ball engine — pure `applyBall(state, event) → state`                 | ✅ 48 tests, full MCC law coverage |
|              | One-handed keypad: 0–6, W, undo always on screen                             | ✅                                 |
|              | Extras as armed modifiers — arm a wide, tap the runs                         | ✅                                 |
|              | Mandatory bowler change at the end of an over (Law 16.2)                     | ✅                                 |
|              | Mandatory next-batter sheet after a wicket                                   | ✅                                 |
|              | Innings break, target, chase, match result                                   | ✅                                 |
|              | Exact undo — every figure is derived, so removing a ball corrects everything | ✅                                 |
| **Identity** | Public career page per player, `/p/<id>`                                     | ✅                                 |
|              | Career + current-season split, form, milestones                              | ✅                                 |
|              | Batting: runs, avg, SR, HS, 4s, 6s, 50s, 100s                                | ✅                                 |
|              | Bowling: wickets, best figures, economy, average, SR                         | ✅                                 |
|              | Fielding: catches, run-outs, stumpings                                       | ✅                                 |
|              | Career screen in the Android app                                             | ✅                                 |
| **Sharing**  | Public scorecard, no app or account needed, `/m/<id>`                        | ✅                                 |
|              | Match card image — result, top scorer, best bowling, POTM                    | ✅                                 |
|              | Player career card image                                                     | ✅                                 |
|              | Per-player match card — one match, 22 shareable cards                        | ✅                                 |
|              | Club page — squad, results, squad leaders, `/c/<id>`                         | ✅                                 |
| **Platform** | Android app (Expo / React Native)                                            | ✅ runs on device                  |
|              | REST API, bearer-token auth                                                  | ✅ 19 endpoints, 106 smoke checks  |
|              | Marketing site                                                               | ✅                                 |
| **Money**    | Banner ads on reading screens, never on the scorer console                   | ✅                                 |
|              | RevenueCat SDK wired, paywall, restore purchases                             | ⏳ needs products in Play Console  |
| **Not yet**  | Deployed to a public URL                                                     | ❌                                 |
|              | Offline-first scoring                                                        | ❌                                 |
|              | Push notifications                                                           | ❌                                 |
|              | Leaderboards, honours boards                                                 | ❌                                 |
|              | Tournaments, multi-user clubs                                                | ❌ post-hackathon                  |

Nothing in the identity or sharing rows is stored. **Every figure is computed
from the ball log**, the same events the scorecard replays — so there is no
aggregate table to drift, and correcting a mis-recorded ball corrects the
career, the cards and the club page at once.

## How it earns

The scorer is the labour; the viewers are the audience. That distinction
decides every monetisation choice:

- **No ad ever appears on a scoring screen.** Not on the free plan, not ever.
  Mis-tapping a ball because an ad loaded under your thumb is how a scorebook
  goes wrong.
- Ads run on **scorecards and share screens**, where people are reading rather
  than tapping.
- A **supporter subscription** removes them. It unlocks no features, because
  no feature is ever gated.
- **Self-host and pay nothing** — there is no ad server in your own build.

## Quick start

Full instructions in [SETUP.md](SETUP.md). The short version:

```bash
# Postgres 16+ and pnpm 9+ required
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

## The one file that matters

`packages/scoring/src/engine.ts` is a pure function:

```
applyBall(matchState, ballEvent) → newMatchState
```

No I/O, no framework, unit-tested against MCC law. Every other number in the
product — the live score, the scorecard, career averages, the share cards — is
derived by replaying ball events through it.

That is why a correction anywhere fixes everything downstream, and why a UI bug
is a presentation problem rather than data corruption. It runs unchanged in the
browser and on the phone.

Its rule sets are exported rather than restated: which dismissals credit the
bowler is Law 25, and anything computing statistics imports
`BOWLER_CREDITED_WICKETS` instead of retyping the list.

## Project structure

```
open-innings/
├── apps/
│   ├── web/                  # Next.js — REST API, public pages, marketing site
│   │   ├── app/
│   │   │   ├── (marketing)/  # Landing, pricing, FAQ, /p/<player>, /c/<club>
│   │   │   ├── api/          # 16 REST endpoints — what the phone talks to
│   │   │   └── m/[matchId]/  # Public scorecard + share cards
│   │   ├── lib/
│   │   │   ├── db/           # Drizzle schema, queries, stats aggregation
│   │   │   └── services/     # Transport-free business logic
│   │   ├── scripts/          # migrate, seed, three smoke suites
│   │   ├── styles/           # Industry design system (vendored)
│   │   └── supabase/         # SQL migrations (path kept for Drizzle tooling)
│   └── mobile/               # Expo / React Native — the scorer
│       ├── app/              # Expo Router screens
│       └── lib/              # API client, session, ads config
├── packages/
│   ├── scoring/              # The engine. Pure TS, no I/O. 48 tests.
│   └── shared/               # Zod schemas + response types. 18 tests.
└── docs/
    ├── architecture.md       # Domain model and the reasoning behind it
    ├── scoring-rules.md      # Cricket law references
    ├── hosting.md            # Where it runs and why
    └── deployment.md         # The original self-hosting plan
```

Both packages ship raw TypeScript with no build step, so Next.js and Metro
consume the same source.

## Tech

**Web** — Next.js 16 (App Router), React 19, Tailwind v3, Drizzle ORM,
Postgres, `postgres.js`
**Mobile** — Expo SDK 57, React Native 0.86, Expo Router, NativeWind v4
**Shared** — TypeScript, Zod, Vitest
**Design** — Industry: Barlow Condensed over Barlow, square-cornered
blueprint objects, one steel accent

Auth is email/password with argon2 and server-side sessions. The API accepts a
bearer token; the phone never uses cookies.

## Testing

```bash
pnpm test          # 66 unit tests — the engine and the shared schemas
pnpm typecheck     # four packages
pnpm lint
pnpm smoke:api     # 77 checks against a running server, bearer auth only
```

`smoke:api` is self-cleaning and safe to run repeatedly. **`smoke:score` and
`smoke:p1` are destructive** — they wipe ball events. Local databases only.

## Contributing

Code, design, translations, rule-testing and bug reports all welcome. The most
useful contribution is scoring a real match and filing an honest issue about
the ball it got wrong.

- [Report a bug](https://github.com/CodeNeuron58/open-innings/issues)
- [Contributing guide](CONTRIBUTING.md)

If your league scores a wide differently, say so — that becomes a toggle rather
than a fork.

## Licence

[AGPL-3.0](LICENSE). Fork it, self-host it, run your league's own instance. If
you run a modified version publicly, publish your changes.

Note this rules out the iOS App Store, whose terms are incompatible with the
AGPL — the same reason VLC and GNU Go are not on it. Android and Samsung only.

---

**Built for club cricket. Owned by everyone who plays it.**
