# Open Innings — Local Setup Guide

Step-by-step instructions to get Open Innings running on your laptop. **No cloud accounts, no third-party signups, no credit cards.**

> **TL;DR**: install Postgres 16+ → install pnpm 9+ → clone repo → `pnpm install` → `cp .env.example .env.local` → `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev` → open <http://localhost:3000>.

---

## 1. Prerequisites

You need three things installed before continuing:

| Tool         | Version | Why                                           |
| ------------ | ------- | --------------------------------------------- |
| **Node.js**  | 20+     | Runs the Next.js app and build tools          |
| **pnpm**     | 9+      | Package manager (we use pnpm workspaces)      |
| **Postgres** | 16+     | The database (any 16.x or 18.x release works) |

Optional but recommended: **Docker Desktop** (lets you skip native Postgres install).

### Install Node.js

Download from <https://nodejs.org> (the LTS version, currently 20.x or 22.x).

Verify:

```bash
node --version    # should print v20.x or v22.x
```

### Install pnpm

```bash
npm install -g pnpm
```

Verify:

```bash
pnpm --version    # should print 9.x or 10.x
```

### Install Postgres (pick one)

#### Option A — Native install (recommended)

1. Go to <https://www.postgresql.org/download/windows/>
2. Click **"Interactive installer by EDB"**
3. Pick **PostgreSQL 16.x for Windows x86-64** (or 18.x — both work)
4. Run the installer:
   - Components: install **PostgreSQL Server**, **pgAdmin 4**, **Command Line Tools**. Uncheck **Stack Builder** (we don't need it).
   - Password for the `postgres` superuser: pick any — defaults below assume `postgres`
   - Port: **5432** (default)
   - Locale: default
5. Verify it works by opening a **new** PowerShell window (so the updated PATH loads) and running:
   ```powershell
   psql -U postgres -h localhost
   # enter the password you just set
   ```
   Type `\q` to quit.

---

## 2. Clone the repository

```bash
git clone https://github.com/open-innings/open-innings.git
cd open-innings
```

## 3. Install dependencies

```bash
pnpm install
```

This installs all packages across the monorepo (just `apps/web` for now, but the workspace is set up for future apps).

## 4. Configure environment

```bash
cp apps/web/.env.example apps/web/.env.local
```

Open `apps/web/.env.local` and confirm the values match your Postgres setup. The defaults work out-of-the-box:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/open_innings"
SESSION_SECRET="dev-only-change-me-before-production-please-use-32-bytes-min"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

If you set a different password during Postgres install, update `DATABASE_URL` accordingly. If you used Docker, the defaults are already correct.

## 5. Create the database

If you're using **native Postgres**, create the empty database once:

```powershell
psql -U postgres -h localhost -c "create database open_innings;"
```

## 6. Apply database migrations

```bash
pnpm db:migrate
```

This runs all SQL files in `apps/web/supabase/migrations/` in lexical order, tracking applied ones in a `__open_innings_migrations` table. Re-running is a no-op.

You should see:

```
→ Applying 4 migration(s):
  0000_initial_schema.sql ... ok
  0001_rls_policies.sql ... ok
  0002_sessions.sql ... ok
  0003_innings_opening_players.sql ... ok
✓ All migrations applied.
```

## 7. Seed the database (optional but recommended for first run)

```bash
pnpm db:seed
```

This creates a dev user, two teams, eight players, and one live match ready to score. You'll see:

```
✓ Dev user: dev@local (password: devpassword123)
✓ Teams: India, Australia
✓ 8 players
✓ Rosters assigned
✓ Sample match: /matches/<id>/score
🎉 Seed complete. Sign in at /login with:
    email:    dev@local
    password: devpassword123
```

The seed is **idempotent** — re-running won't duplicate rows. Safe to run any time.

## 8. Start the dev server

```bash
pnpm dev
```

Open <http://localhost:3000>. You should land on the homepage.

Click **Sign in** in the top-right and use the seeded credentials:

- **Email**: `dev@local`
- **Password**: `devpassword123`

You'll land on the dashboard. Navigate to **Matches** → click **Score** on the seeded "Sample Match" → tap a button (try `4`) → see the score update.

---

## Useful commands

| Command                                   | What it does                                 |
| ----------------------------------------- | -------------------------------------------- |
| `pnpm dev`                                | Start the Next.js dev server with hot reload |
| `pnpm build`                              | Production build                             |
| `pnpm lint`                               | ESLint                                       |
| `pnpm typecheck`                          | TypeScript validation (no emit)              |
| `pnpm test`                               | Run all tests (Vitest)                       |
| `pnpm db:migrate`                         | Apply pending SQL migrations                 |
| `pnpm db:seed`                            | Populate the database with dev data          |
| `pnpm db:studio`                          | Open Drizzle Studio (visual DB browser)      |
| `pnpm tsx apps/web/scripts/auth-smoke.ts` | Run the auth round-trip smoke test           |

---

## Troubleshooting

### `psql: command not found` (or "the term 'psql' is not recognized")

Postgres isn't in your PATH. Either:

- **Native install**: close and reopen PowerShell so PATH refreshes, OR
- Use the full path: `& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost` (adjust the version number if you installed a different one)

If PATH still won't pick it up after reopening PowerShell, add it manually:

```powershell
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\PostgreSQL\16\bin", "User")
```

Close and reopen PowerShell.

### `password authentication failed for user "postgres"`

You used a different password during Postgres install than what's in `.env.local`. Either:

- Update `DATABASE_URL` in `.env.local` to use the password you actually set, OR
- Reset the postgres password (see next section).

### Resetting the `postgres` password

If you forgot what password you set during install, you can reset it:

1. Open PowerShell **as Administrator**
2. Stop Postgres:
   ```powershell
   taskkill /F /IM postgres.exe
   ```
3. Edit `C:\Program Files\PostgreSQL\16\data\pg_hba.conf` and find the line for `host all all 127.0.0.1/32`. Change `scram-sha-256` to `trust` (just temporarily).
4. Start Postgres:
   ```powershell
   & "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe" -D "C:\Program Files\PostgreSQL\16\data" start
   ```
5. Connect and reset:
   ```powershell
   & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost
   ```
   ```sql
   ALTER USER postgres WITH PASSWORD 'postgres';
   \q
   ```
6. Edit `pg_hba.conf` again and change `trust` back to `scram-sha-256`.
7. Reload Postgres:
   ```powershell
   & "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe" -D "C:\Program Files\PostgreSQL\16\data" reload
   ```
8. Update `DATABASE_URL` in `.env.local` to use the new password and try again.

### `relation "users" does not exist`

You skipped step 6. Run `pnpm db:migrate`.

### `Error: connect ECONNREFUSED 127.0.0.1:5432`

Postgres isn't running. Either:

- **Native**: open **Services** (`services.msc`), find `postgresql-x64-16` (or 18), click Start.

### Sign-in form gives "Invalid email or password"

You're not using the seeded credentials. The seed creates `dev@local` / `devpassword123`. If you ran `pnpm db:seed` but still get this, run the seed again — it's idempotent.

### Dev server says "Another server is running on port 3000"

Either:

- Kill the old process: `taskkill /F /IM node.exe` (Windows) / `pkill node` (macOS/Linux)
- Or use a different port: `pnpm dev -- -p 3001`

### `Cannot find module '@node-rs/argon2'` or similar on `pnpm install`

The native argon2 binary failed to build. On Windows this usually means you need the **Visual Studio Build Tools** with the "Desktop development with C++" workload installed: <https://visualstudio.microsoft.com/downloads/> (scroll to "Tools for Visual Studio" → "Build Tools for Visual Studio").

If you don't want to install build tools, you can switch to a pure-JS argon2 implementation by replacing `@node-rs/argon2` with `argon2` in `apps/web/package.json` (it uses Node's `crypto` module and has no native build).

### `pgAdmin` errors with "PermissionError" on startup

Common on Windows when Postgres is installed in `Program Files` (which requires admin). Either:

- Always run pgAdmin as Administrator, OR
- Just skip pgAdmin — the `psql` CLI is all you need for everything in this guide.

---

## Resetting everything

If you want to start over from scratch:

```bash
# Drop and recreate the database
psql -U postgres -h localhost -c "drop database open_innings;"
psql -U postgres -h localhost -c "create database open_innings;"

# Re-apply migrations and seed
pnpm db:migrate
pnpm db:seed
```

---

## Project layout (where things live)

```
apps/web/
├── app/
│   ├── (app)/                # Authenticated routes (with nav)
│   │   ├── dashboard/
│   │   ├── players/
│   │   ├── teams/
│   │   └── matches/
│   ├── (auth)/               # Public auth routes
│   │   ├── login/
│   │   └── signup/
│   ├── m/[matchId]/          # PUBLIC scorecard (no auth required)
│   ├── api/                  # Route handlers
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── Nav.tsx
│   ├── scorer/               # The big-button scoring UI
│   └── scorecard/            # Read-only scorecard components
├── lib/
│   ├── auth/                 # argon2 + sessions + cookies
│   ├── db/                   # Drizzle schema + queries
│   └── scoring/              # Pure-function engine + 44 unit tests
├── scripts/                  # migrate.ts, seed.ts, auth-smoke.ts
├── supabase/migrations/      # SQL migrations
├── .env.local                # YOUR config (not committed)
└── .env.example              # Template (committed)
```

The most important file is `packages/scoring/src/engine.ts` — a pure function `applyBall(state, event) → newState` with 48 tests covering MCC cricket rules.

---

## Next steps

- Read [docs/architecture.md](docs/architecture.md) for the design rationale
- Try scoring a match manually
- Look at the unit tests in `packages/scoring/src/__tests__/` to see how the engine is verified
- Check `apps/web/scripts/auth-smoke.ts` to see how the auth layer is tested end-to-end
