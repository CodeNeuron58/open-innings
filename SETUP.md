# Open Innings — local setup

Getting the project running on your machine. **No cloud accounts, no
third-party signups, no credit card.**

> **TL;DR** — install Postgres 16+ and pnpm 9+ → `pnpm install` →
> `cp apps/web/.env.example apps/web/.env.local` → `pnpm db:migrate` →
> `pnpm db:seed` → `pnpm dev` → <http://localhost:3000>

---

## 1. Prerequisites

| Tool         | Version | Why                                        |
| ------------ | ------- | ------------------------------------------ |
| **Node.js**  | 20+     | Runs the app and the build tools           |
| **pnpm**     | 9+      | Package manager — this is a pnpm workspace |
| **Postgres** | 16+     | The database. Any 16.x or later works      |

```bash
node --version     # v20.x or newer
npm install -g pnpm
pnpm --version     # 9.x or newer
```

### Postgres on Windows

1. Download the **Interactive installer by EDB** from
   <https://www.postgresql.org/download/windows/>
2. Install **PostgreSQL Server**, **pgAdmin 4** and **Command Line Tools**.
   Uncheck Stack Builder.
3. Set a password for the `postgres` superuser — the defaults below assume
   `postgres`.
4. Keep port **5432**.
5. Open a **new** PowerShell window so the updated PATH loads, then check:
   ```powershell
   psql -U postgres -h localhost
   ```
   `\q` to quit.

On macOS, `brew install postgresql@16 && brew services start postgresql@16` is
the equivalent.

---

## 2. Clone and install

```bash
git clone https://github.com/CodeNeuron58/open-innings.git
cd open-innings
pnpm install
```

This installs all four workspaces: `apps/web`, `apps/mobile`,
`packages/scoring` and `packages/shared`.

## 3. Configure

```bash
cp apps/web/.env.example apps/web/.env.local
```

The defaults work out of the box against a local Postgres:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/open_innings"
SESSION_SECRET="dev-only-change-me-before-production-please-use-32-bytes-min"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

If you set a different Postgres password, update `DATABASE_URL` to match.

## 4. Create the database

```bash
psql -U postgres -h localhost -c "create database open_innings;"
```

## 5. Migrate

```bash
pnpm db:migrate
```

This applies every SQL file in `apps/web/supabase/migrations/` in lexical
order, recording what it has done in a `__open_innings_migrations` table.
Re-running is a no-op. There are currently **22 migrations**.

## 6. Seed (optional, but do it on a first run)

```bash
pnpm db:seed
```

Creates a dev user, two teams, eight players and one live match with the
openers already set, ready to score.

> ⚠️ **The seed creates `dev@local` / `devpassword123`, and that password is
> published in this repository.** The script refuses to run with
> `NODE_ENV=production` or against a non-local `DATABASE_URL` — you would have
> to set `OI_SEED_REMOTE=1` to override it, and you should not. Production gets
> `pnpm db:migrate` and nothing else.

It is idempotent; re-running will not duplicate rows.

## 7. Run it

```bash
pnpm dev
```

Open <http://localhost:3000>, sign in with `dev@local` / `devpassword123`, go
to **Matches → Score** on the seeded match, and tap `4`. The score should move.

---

## The Android app

```bash
cd apps/mobile
pnpm start
```

Then open the **development build** on your phone. **Expo Go cannot run this
project** — RevenueCat and AdMob are native modules that Expo Go does not
ship. [apps/mobile/README.md](apps/mobile/README.md) covers building the dev
client.

You do not need to configure an API URL for local work. A phone cannot reach
`localhost`, but it is on the same wifi as your machine, and `lib/config.ts`
derives the API host from the address Metro is already serving on.

---

## Useful commands

| Command           | What it does                                              |
| ----------------- | --------------------------------------------------------- |
| `pnpm dev`        | Next.js dev server with hot reload                        |
| `pnpm build`      | Production build                                          |
| `pnpm test`       | 460 unit tests across all four workspaces                 |
| `pnpm typecheck`  | TypeScript, no emit                                       |
| `pnpm lint`       | ESLint                                                    |
| `pnpm format`     | Prettier — also sorts Tailwind classes                    |
| `pnpm db:migrate` | Apply pending migrations                                  |
| `pnpm db:seed`    | Dev fixtures                                              |
| `pnpm db:reset`   | Drop and recreate. Local only                             |
| `pnpm db:verify`  | Replay every innings and report anything the rules refuse |
| `pnpm db:backup`  | `pg_dump` to `backups/`                                   |
| `pnpm db:studio`  | Drizzle Studio, a visual browser                          |
| `pnpm smoke:api`  | 290 checks against a running server                       |

### Running the smoke suites

They drive real HTTP against a real database, so they need a server:

```bash
pnpm build
pnpm start                                          # one shell
SMOKE_BASE_URL=http://localhost:3000 pnpm smoke:api # another
```

`smoke:api`, `smoke:correct` and `smoke:browse` create their own accounts and
clean up after themselves. **`smoke:score` and `smoke:p1` are destructive** —
they wipe ball events, so local databases only.

Two things that will confuse you once each:

- **`smoke:api` cannot be run twice within an hour** against the same server.
  It uses most of its own signup rate-limit allowance in one pass, and the
  refusal surfaces as an unrelated assertion failing. Restart the server to
  clear the in-process limiter.
- **Run them against `pnpm start`, not `pnpm dev`.** On Windows the Turbopack
  dev server does not register routes nested two levels under a dynamic
  segment, so `/api/matches/[id]/ball/[ballId]` 404s there. `next build`
  enumerates them correctly.

---

## Troubleshooting

### `psql: command not found`

Postgres is not on your PATH. Close and reopen your terminal first — the
installer updates PATH for new sessions only. Failing that:

```powershell
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\PostgreSQL\16\bin", "User")
```

### `password authentication failed for user "postgres"`

`DATABASE_URL` does not match the password you set during installation. Change
one to match the other.

### `relation "users" does not exist`

You skipped step 5. Run `pnpm db:migrate`.

### `connect ECONNREFUSED 127.0.0.1:5432`

Postgres is not running. On Windows, open `services.msc` and start
`postgresql-x64-16`.

### `Cannot find module '@node-rs/argon2'`

The native argon2 binary failed to build. On Windows this usually means you
need the **Visual Studio Build Tools** with the "Desktop development with C++"
workload: <https://visualstudio.microsoft.com/downloads/>.

### A burst of "not assignable to parameter of type" errors on routes you know exist

Stale generated types, not a real error. Two separate caches do this:

```bash
rm -rf apps/web/.next/dev          # Next's route types
rm -rf apps/mobile/.expo/types     # Expo Router's, then re-run `pnpm start`
```

Both are generated and gitignored, and neither regenerates on a schedule — so
adding a screen leaves the old type file in place and every `href` to your new
route fails against the old list.

### "Another server is running on port 3000"

```bash
npx kill-port 3000        # or: taskkill /F /IM node.exe on Windows
```

---

## Starting over

```bash
psql -U postgres -h localhost -c "drop database open_innings;"
psql -U postgres -h localhost -c "create database open_innings;"
pnpm db:migrate
pnpm db:seed
```

Or `pnpm db:reset`, which does the same thing and refuses to run against
anything but a local database.

---

## Next steps

- [docs/architecture.md](docs/architecture.md) — the three decisions that are
  expensive to reverse
- [docs/scoring-rules.md](docs/scoring-rules.md) — how each cricket law is
  modelled
- `packages/scoring/src/__tests__/` — how the engine is actually verified
- [CONTRIBUTING.md](CONTRIBUTING.md) — the workflow, and what CI checks
