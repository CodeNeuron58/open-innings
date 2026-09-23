<div align="center">

<img src="apps/mobile/assets/play-icon-512.png" width="112" alt="Open Innings">

# Open Innings

**Ball-by-ball cricket scoring for club, league, box and gully cricket.**

[![CI](https://github.com/CodeNeuron58/open-innings/actions/workflows/ci.yml/badge.svg)](https://github.com/CodeNeuron58/open-innings/actions/workflows/ci.yml)
[![Licence: AGPL-3.0](https://img.shields.io/badge/licence-AGPL--3.0-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-489%20unit-success.svg)](#testing)
[![Node](https://img.shields.io/badge/node-20%2B-brightgreen.svg)](.nvmrc)

[Website](https://openinnings.com) · [Setup](SETUP.md) · [Architecture](docs/architecture.md) · [Scoring rules](docs/scoring-rules.md) · [Contributing](CONTRIBUTING.md)

</div>

---

Every amateur cricketer plays for years and keeps **no record of any of it**. Runs
vanish into paper scorebooks, and the apps that would keep them charge the one
person doing three hours of work.

Open Innings inverts that. **Scoring is free forever, with no ads on the scoring
screen.** Readers of a scorecard are the audience, and that is where the app earns.

## What it does

|                             |                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Scores every delivery**   | Dots, 1–6, wides, no-balls, byes, leg byes, penalties, free hits and 14 dismissal types — under the Laws, not approximations. |
| **Works with no signal**    | A tap writes to SQLite and returns. The queue drains when there is signal; undo and corrections work offline.                 |
| **Corrects any ball**       | Not just the last one. The innings replays from the ball you changed.                                                         |
| **Shares a live scorecard** | One link, no app required. Plus a share card for WhatsApp.                                                                    |
| **Keeps career records**    | Batting and bowling figures across every match a player appears in.                                                           |
| **Draws the wagon wheel**   | Hold a runs key to place the shot. Optional — a tap still scores in one tap.                                                  |

## How it works

The scoring engine is a **pure function** with no I/O and no framework, so the same
code runs in the browser and on the phone:

```ts
applyBall(state, event) → newState
```

Three ideas hold the system together:

- **`ball_events` is the only truth.** Every score, average and strike rate is derived
  by replaying the log. Nothing is stored twice, so nothing can disagree.
- **Validate on write, tolerate on read.** A delivery is refused if it breaks a Law.
  A stored delivery always replays, even if the Laws in code have moved since.
- **The Laws live in one place.** `packages/scoring/src/rules.ts` exports the sets —
  which dismissals credit the bowler, which extras skip his analysis — so no second
  copy can drift.

## How it earns

Ads appear on **viewing** surfaces only, never while scoring. A **Supporter**
subscription removes them everywhere, on every device you sign in on.

Entitlements are handled by **RevenueCat**, so the app asks one question —
_does this person have `supporter`?_ — and never which product they bought:

```ts
// apps/mobile/lib/purchases.tsx
export const ENTITLEMENT_ID = 'supporter';
```

Adding a plan or changing a price is a dashboard change, not a release.

## Quick start

```sh
pnpm install
cp apps/web/.env.example apps/web/.env.local   # DATABASE_URL, RESEND_API_KEY
pnpm db:migrate
pnpm dev                                       # web on :3000
pnpm --filter mobile start                     # Expo
```

Full instructions, including Postgres and the mobile toolchain, are in **[SETUP.md](SETUP.md)**.

## Project layout

```
apps/web         Next.js — API, public scorecards, marketing site
apps/mobile      Expo / React Native — the scorer's app
packages/scoring Pure engine: laws, replay, scorecards
packages/shared  Zod schemas shared by both apps
```

## Testing

**489 unit tests** across the four workspaces, plus smoke suites that play whole
matches against a live server and replay the stored log to prove it still parses.
CI runs typecheck, lint, format and every suite on each push.

```sh
pnpm test         # unit
pnpm typecheck
pnpm smoke:score  # a full match against a running server
```

## Self-hosting

A club can run its own copy. Any Node host and a Postgres database will do —
see **[docs/hosting.md](docs/hosting.md)**.

## Licence

**[AGPL-3.0](LICENSE).** Run it, fork it, host it for your club. If you run a modified
copy as a network service, publish your changes.

Contributions welcome — start with **[CONTRIBUTING.md](CONTRIBUTING.md)**.
