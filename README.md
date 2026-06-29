# 🏏 Open Innings

> **Free, open-source, forever.** A community-owned cricket scoring app — the Lichess of cricket.

[Quick start](#quick-start) · [Setup guide](SETUP.md) · [Architecture](docs/architecture.md) · [Contributing](CONTRIBUTING.md) · [Donate](https://opencollective.com/open-innings)

---

## Why Open Innings?

Cricket scoring apps that are full-featured are paywalled. CricHeroes is the dominant player and monetises aggressively — subscriptions, ads, premium features. Free options are either read-only score widgets or single-user toy apps.

There is **no community-owned, free-forever, feature-complete alternative** in cricket. Chess has [Lichess](https://lichess.org) — open source, donation-funded, free forever, and better than the commercial incumbents. **We're building the equivalent for cricket.**

## Features

### v0.1 (current — in development)
- 📱 Ball-by-ball scorer (mobile-first, one-handed usable)
- 📊 Public scorecards — shareable links, no login to view
- 👥 Player database — career stats, photos, teams
- 🏟️ Teams with squads
- ↩️ Undo last ball (ball events are the source of truth)
- 🔐 Local email/password auth (no third-party login required)

### v0.2
- 🏆 Tournament organisation — round-robin, knockout, group+KO
- 📈 Leaderboards — most runs, most wickets, best SR, best economy
- 🗺️ Match insights — wagon wheel, pitch map, run progression

### v0.3
- ⚡ Real-time updates (WebSockets)
- 👥 Multi-user clubs
- 🎥 Embedded YouTube/Facebook Live URLs
- 🌧️ Super Over + DLS support

**Out of scope (needs funding):** native live streaming CDN, video highlights, AI video analysis.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript | SEO for public scorecards, RSC pairs well with our server-first design |
| Styling | Tailwind CSS | Fast to ship, no design-system lock-in |
| Database | Postgres (native) | Free, runs anywhere, no third-party dependency |
| ORM | Drizzle | Lightweight, type-safe, SQL-first |
| Auth | Self-hosted (argon2 + session cookies) | No Supabase, no Clerk, no vendor lock-in |
| Deploy | TBD — likely Oracle Cloud free + Cloudflare | Free tier we control, no surprise billing |
| Realtime (v0.1) | Polling | Simplest. WebSockets deferred to v0.3 |

## Quick start

The fastest path to running the app on your laptop:

```bash
# 1. Install Postgres 16+ and pnpm 9+ (see SETUP.md for details)

# 2. Clone and install
git clone https://github.com/open-innings/open-innings.git
cd open-innings
pnpm install

# 3. Configure environment
cp apps/web/.env.example apps/web/.env.local
# Edit apps/web/.env.local — defaults work if Postgres is on localhost:5432
# with user=postgres, password=postgres, db=open_innings

# 4. Start Postgres, then apply migrations + seed
pnpm db:migrate
pnpm db:seed

# 5. Start the dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the seeded dev account:

- **Email**: `dev@local`
- **Password**: `devpassword123`

Then go to **Matches** → click **Score** on the seeded match → tap a button to score a ball.

**Need help?** See [SETUP.md](SETUP.md) for the full guide (Windows / macOS / Linux, troubleshooting, project layout).

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full design — domain model, schema, feature cuts, and the reasoning behind each choice.

The single most important file in the codebase is `apps/web/lib/scoring/engine.ts`. It's a pure function that takes `(matchState, ballEvent) → newMatchState` and is unit-tested against every MCC cricket rule. If you get that right with comprehensive tests, every UI bug becomes a presentation problem, not a data corruption problem.

## Project structure

```
open-innings/
├── apps/
│   └── web/                  # Next.js app (the whole product lives here in v0.1)
│       ├── app/              # Routes — App Router
│       ├── components/       # React components
│       ├── lib/
│       │   ├── auth/         # Email/password auth (argon2, sessions)
│       │   ├── db/           # Drizzle schema + typed queries
│       │   └── scoring/      # Pure-function scoring engine + 44 tests
│       ├── scripts/          # migrate.ts, seed.ts, auth-smoke.ts
│       └── supabase/         # SQL migrations (kept here for Drizzle tooling)
├── docs/
│   ├── architecture.md       # Architecture decisions
│   ├── scoring-rules.md      # Cricket rule references
│   └── donation-model.md     # How funding works
└── README.md
```

## Contributing

We welcome contributors of all kinds — code, design, documentation, translations, rule-testing, bug reports.

- 🐛 [Report a bug](https://github.com/open-innings/open-innings/issues/new?template=bug.yml)
- 💡 [Request a feature](https://github.com/open-innings/open-innings/issues/new?template=feature.yml)
- 🔧 [Submit a PR](CONTRIBUTING.md)
- 💬 [Join the discussion](https://github.com/open-innings/open-innings/discussions)

## Deployment

Open Innings is designed to run on **free-tier infrastructure**:

- **Database**: Postgres on Oracle Cloud Free Tier ARM VM (free forever, 24GB RAM)
- **App + bandwidth**: Cloudflare (free) or Vercel (free)

Detailed deployment instructions are coming once we've validated the local setup end-to-end. If you're an early adopter willing to deploy this yourself, see [docs/deployment.md](docs/deployment.md) (TODO).

## Funding

Open Innings is **free forever** and will never have ads, paywalls, or feature locks.

We run on donations via [Open Collective](https://opencollective.com/open-innings) and [Liberapay](https://liberapay.com/open-innings). All expenses (servers, domains, design) are published transparently.

Inspired by [Lichess](https://lichess.org/about), which has been free and donation-funded since 2010.

## License

[AGPL-3.0](LICENSE) — like Lichess. You can fork it, but if you run a modified version publicly, you must publish your changes. Keeps the ecosystem open.

---

**Built by cricket lovers. Owned by everyone.**