# Contributing to Open Innings

Thanks for wanting to make cricket scoring free for everyone. 🏏

Every contribution matters — code, design, documentation, bug reports,
rule-testing or translations. The most valuable one is not code: **score a real
match on it and tell us about the ball it got wrong.**

## Quick links

- 🐛 [Report a bug](https://github.com/CodeNeuron58/open-innings/issues/new)
- 💡 [Request a feature](https://github.com/CodeNeuron58/open-innings/issues/new)
- 💬 [Discussions](https://github.com/CodeNeuron58/open-innings/discussions)
- 🔒 [Security policy](SECURITY.md) — report vulnerabilities privately, not in an issue
- 📖 [Architecture](docs/architecture.md) · [Cricket rules](docs/scoring-rules.md)

## Getting it running

[SETUP.md](SETUP.md) is the full walkthrough, including Postgres on Windows and
the errors you are most likely to hit. The short version:

```bash
git clone https://github.com/YOUR-USERNAME/open-innings.git
cd open-innings
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm db:migrate
pnpm db:seed          # dev only — creates dev@local / devpassword123
pnpm dev              # http://localhost:3000
```

You need Node 20+, pnpm 9+ and Postgres 16+. The Android app additionally needs
a development build — Expo Go cannot run this project, and
[apps/mobile/README.md](apps/mobile/README.md) explains why.

## Where the code lives

```
apps/
  web/                # Next.js — the REST API, public pages, marketing site
    app/api/          # 31 route files
    lib/db/           # Drizzle schema, queries, career SQL
    lib/services/     # Transport-free business logic
    scripts/          # migrate, seed, backup, verify, and seven smoke suites
    supabase/
      migrations/     # Hand-written SQL, applied by scripts/migrate.ts.
                      # Kept under this folder name for Drizzle tooling —
                      # nothing here is tied to Supabase-the-service.
  mobile/             # Expo / React Native — the scorer
packages/
  scoring/            # The engine. Pure functions, no I/O. Heavily tested.
  shared/             # Zod schemas and response types, imported by both sides
docs/                 # Architecture, cricket laws, hosting, funding
```

## Where to start

| If you are…           | Start with…                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| New to the codebase   | [docs/architecture.md](docs/architecture.md) → `lib/db/schema.ts` → `packages/scoring/src/engine.ts`                            |
| Fixing a bug          | [`good first issue`](https://github.com/CodeNeuron58/open-innings/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) |
| Adding a feature      | Open an issue first — let's agree the shape before you write it                                                                 |
| A cricket expert      | Read [docs/scoring-rules.md](docs/scoring-rules.md) and tell us where it is wrong                                               |
| A designer            | [Open design issues](https://github.com/CodeNeuron58/open-innings/issues?q=is%3Aopen+is%3Aissue+label%3Adesign)                 |
| Writing documentation | Typos, missing examples, anything unclear — all welcome                                                                         |

## The three rules that matter

**1. `ball_events` is the source of truth.** Never store a derived number as
though it were a fact. If you find yourself wanting to save a batter's total,
read [docs/architecture.md](docs/architecture.md) first — there is a reason it
is computed every time.

**2. The engine is not a place to be creative.** `packages/scoring` is the most
thoroughly tested part of this codebase and every other part depends on it
being right. Do not modify it except to fix a proven rules bug with a test that
fails without the fix. If a change elsewhere seems to require touching the
engine, the change is probably wrong.

**3. A cricket rule without a test does not ship.** Add the test first. For
anything that should hold over _every_ possible innings, put it in the property
tests (`__tests__/properties.test.ts`) rather than picking three examples.

## Code style

- **TypeScript strict.** No `any` — prefer `unknown` and a type guard.
- **Tailwind for styling**, on both web and mobile. No inline styles.
- **Drizzle for the database.** Write SQL when SQL is clearer; don't fight the
  ORM to avoid it.
- **Comments explain _why_.** The code already says what it does. A comment
  that restates the line above it is noise; one that records the reasoning
  behind a non-obvious choice is the most valuable thing in the file.

Run `pnpm format && pnpm lint` before committing. Prettier sorts Tailwind
classes, so a formatting pass will reorder `className` strings — that is
expected.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scorer): add free hit indicator
fix(scorecard): correct wide ball accounting
docs(readme): add setup instructions
test(scoring): add super over edge case
```

Write the body for whoever has to understand the change in a year. What was
wrong, why it was wrong, and what you decided instead.

## Pull requests

1. Open an issue first if the change is non-trivial
2. Branch from `master`: `git checkout -b feat/your-feature`
3. Make the change, with tests
4. Run the whole gate locally — it is what CI runs:
   ```bash
   pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
   ```
5. If you touched the API surface, run the smoke suite against a running
   server: `pnpm build && pnpm start` in one shell, then
   `SMOKE_BASE_URL=http://localhost:3000 pnpm smoke:api`
6. Push and open a PR

**CI runs the format check first**, so an unformatted file fails the build with
a style error before lint or typecheck ever run. If CI is red for a reason that
makes no sense, check formatting first.

## Areas needing help right now

- 🏏 **Cricket rule expertise** — review the engine against the MCC Laws
- 🌐 **Translations** — Hindi, Tamil, Telugu, Marathi, Bengali
- 🐛 **QA on real matches** — the edge cases nobody thought of
- 🎨 **Mobile UI** — the scorer has to be usable one-handed, in sunlight
- 📹 **Short video walkthroughs** of common workflows

## Code of conduct

We follow the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind, be
respectful, assume good faith.

## Licence

By contributing, you agree that your contributions are licensed under
[AGPL-3.0](LICENSE), the same as the project.

---

Questions? Open a
[discussion](https://github.com/CodeNeuron58/open-innings/discussions).
