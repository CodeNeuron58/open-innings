# Contributing to Open Innings

Thanks for your interest in making cricket scoring free for everyone! 🏏

Open Innings is a community project. Every contribution matters — code, design, documentation, bug reports, rule-testing, translations, or just spreading the word.

## Quick links

- 🐛 [Report a bug](https://github.com/open-innings/open-innings/issues/new?template=bug.yml)
- 💡 [Request a feature](https://github.com/open-innings/open-innings/issues/new?template=feature.yml)
- 💬 [Discussions](https://github.com/open-innings/open-innings/discussions)
- 📖 [Architecture](docs/architecture.md)
- 💸 [Donate](https://opencollective.com/open-innings)

## Local setup

### Prerequisites

- Node.js 20+ ([download](https://nodejs.org))
- pnpm 9+ (`npm install -g pnpm`)
- A local Postgres 16+ install — see [SETUP.md](SETUP.md) for step-by-step
- Git

### First run

```bash
# 1. Fork + clone
git clone https://github.com/YOUR-USERNAME/open-innings.git
cd open-innings

# 2. Install
pnpm install

# 3. Set up env
cp apps/web/.env.example apps/web/.env.local
# Defaults work if Postgres is on localhost:5432 with user=postgres,
# password=postgres, db=open_innings

# 4. Apply database migrations + seed data
pnpm db:migrate
pnpm db:seed

# 5. Start the dev server
pnpm dev
```

Open <http://localhost:3000>.

## Project structure

```
apps/
  web/                # The Next.js application
    app/              # Pages (App Router)
    components/       # React components
    lib/
      db/             # Drizzle schema + client
      scoring/        # The scoring engine — pure functions, heavily tested
      auth/           # Local email/password auth (argon2, session cookies)
    supabase/
      migrations/     # Hand-written SQL, applied by scripts/migrate.ts
                       # (kept under this folder name for Drizzle tooling —
                       # not tied to Supabase-the-service)
packages/
  shared/             # Types shared with future mobile apps (not yet created)
docs/                 # Architecture, rule references, donation model, deployment
```

## Where to start

| If you are... | Start with... |
|---|---|
| New to the codebase | [docs/architecture.md](docs/architecture.md) → read `lib/db/schema.ts` → read `lib/scoring/engine.ts` (coming in next milestone) |
| Want to fix a bug | Check [`good first issue`](https://github.com/open-innings/open-innings/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) |
| Want to add a feature | Open an issue first — let's discuss before you code |
| Cricket expert | Help us test scoring rules against real matches |
| Designer | See [open design issues](https://github.com/open-innings/open-innings/issues?q=is%3Aopen+is%3Aissue+label%3Adesign) |
| Documentation | Typos, missing examples, unclear explanations — all welcome |

## Code style

- **TypeScript strict mode** — no `any`, prefer `unknown` + type guards
- **Tailwind for styling** — no inline styles, use utility classes
- **Drizzle for DB** — write SQL when needed, don't fight the ORM
- **Pure functions for the scoring engine** — keep state management simple
- **Tests for cricket rules** — every rule needs a unit test (or it doesn't ship)

We use Prettier + ESLint. Run `pnpm format && pnpm lint` before committing.

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scorer): add free hit indicator
fix(scorecard): correct wide ball accounting
docs(readme): add setup instructions
test(scoring): add super over edge case
```

## Pull request process

1. Open an issue first if the change is non-trivial
2. Create a feature branch from `main`: `git checkout -b feat/your-feature`
3. Make your changes
4. Add tests if applicable (especially for scoring rules)
5. Run `pnpm typecheck && pnpm lint && pnpm test` locally
6. Push and open a PR
7. Wait for review — be patient, we're all volunteers

## Code of conduct

We follow the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind, be respectful, assume good faith.

## Areas needing help right now

- 🏏 **Cricket rule expertise** — review our scoring engine against MCC laws
- 🎨 **Mobile UI design** — the scorer needs to be one-handed usable
- 🌐 **Translations** — Hindi, Tamil, Telugu, Marathi, Bengali, etc.
- 📹 **Video tutorials** — short YouTube clips of common workflows
- 🐛 **QA on real matches** — find edge cases in scoring logic
- 💸 **Outreach** — help us reach cricket clubs and tournament organisers

## License

By contributing, you agree that your contributions will be licensed under [AGPL-3.0](LICENSE) — the same as the project.

---

Questions? Open a [discussion](https://github.com/open-innings/open-innings/discussions). We respond to everyone.
