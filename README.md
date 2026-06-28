# 🏏 Open Innings

> **Free, open-source, forever.** A community-owned cricket scoring app — the Lichess of cricket.

[Live demo](https://open-innings.app) · [Contribute](CONTRIBUTING.md) · [Donate](https://opencollective.com/open-innings) · [Roadmap](docs/architecture.md)

---

## Why Open Innings?

Cricket scoring apps that are full-featured are paywalled. CricHeroes is the dominant player and monetises aggressively — subscriptions, ads, premium features. Free options are either read-only score widgets or single-user toy apps.

There is **no community-owned, free-forever, feature-complete alternative** in cricket. Chess has [Lichess](https://lichess.org) — open source, donation-funded, free forever, and better than the commercial incumbents. **We're building the equivalent for cricket.**

## Features

### v0.1 (in progress)
- 📱 Ball-by-ball scorer (mobile-first, one-handed usable)
- 📊 Public scorecards — shareable on WhatsApp, no login to view
- 👥 Player database — career stats, photos, teams
- 🏟️ Teams with squads, captains, wicketkeepers
- ↩️ Undo last ball (ball events are the source of truth)

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

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Supabase (Postgres + Auth + Storage) |
| ORM | Drizzle |
| Deploy | Vercel + Supabase Cloud |

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Set up Supabase (see SETUP.md)
#    Create a project at supabase.com, then:
cp apps/web/.env.example apps/web/.env.local
#    Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

# 3. Generate + apply database migrations
pnpm db:generate
pnpm db:migrate

# 4. Start the dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full design — domain model, schema, feature cuts, and the reasoning behind each choice.

The single most important file in the codebase is `apps/web/lib/scoring/engine.ts`. It's a pure function that takes `(matchState, ballEvent) → newMatchState` and is unit-tested against every MCC cricket rule. If you get that right with comprehensive tests, every UI bug becomes a presentation problem, not a data corruption problem.

## Project structure

```
open-innings/
├── apps/
│   └── web/                  # Next.js app
├── packages/
│   └── shared/               # Shared types (future: web + mobile)
├── docs/
│   ├── architecture.md       # Architecture decisions
│   ├── scoring-rules.md      # Cricket rule references
│   └── donation-model.md     # How funding works
├── .github/workflows/        # CI
└── README.md
```

## Contributing

We welcome contributors of all kinds — code, design, documentation, translations, rule-testing, bug reports.

- 🐛 [Report a bug](https://github.com/open-innings/open-innings/issues/new?template=bug.yml)
- 💡 [Request a feature](https://github.com/open-innings/open-innings/issues/new?template=feature.yml)
- 🔧 [Submit a PR](CONTRIBUTING.md)
- 💬 [Join the discussion](https://github.com/open-innings/open-innings/discussions)

## Funding

Open Innings is **free forever** and will never have ads, paywalls, or feature locks.

We run on donations via [Open Collective](https://opencollective.com/open-innings) and [Liberapay](https://liberapay.com/open-innings). All expenses (servers, domains, design) are published transparently.

Inspired by [Lichess](https://lichess.org/about), which has been free and donation-funded since 2010.

## License

[AGPL-3.0](LICENSE) — like Lichess. You can fork it, but if you run a modified version publicly, you must publish your changes. Keeps the ecosystem open.

---

**Built by cricket lovers. Owned by everyone.**
