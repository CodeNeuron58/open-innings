# Open Innings — Setup Guide

Step-by-step instructions to get Open Innings running locally.

## 1. Install prerequisites

- **Node.js 20+** — <https://nodejs.org>
- **pnpm 9+** — `npm install -g pnpm`
- **Git** — <https://git-scm.com>

## 2. Create a Supabase project

1. Go to <https://supabase.com/dashboard> and sign in
2. Click **"New Project"**
3. Choose an organization, name it (e.g. `open-innings-dev`), set a strong database password
4. Pick the **closest region** to you (e.g. `ap-south-1` Mumbai for India)
5. Wait for the project to provision (~2 minutes)

## 3. Get your Supabase keys

In your Supabase project dashboard:

1. Go to **Settings → API**
2. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key (⚠️ keep secret) → `SUPABASE_SERVICE_ROLE_KEY`
3. Go to **Settings → Database → Connection string → Transaction pooler**
4. Copy the URI → `DATABASE_URL`

## 4. Configure environment

```bash
cd apps/web
cp .env.example .env.local
# Edit .env.local with the values from step 3
```

## 5. Install dependencies

From the repo root:

```bash
pnpm install
```

## 6. Apply database migrations

```bash
# Generate migration SQL from the Drizzle schema (first time only)
pnpm db:generate

# Apply migrations to your Supabase database
pnpm db:migrate
```

## 7. Apply RLS policies

The Drizzle migrations only create tables. The Row Level Security policies
and auth triggers must be applied via the Supabase SQL editor:

1. In your Supabase dashboard, go to **SQL Editor**
2. Click **"New query"**
3. Paste the contents of `apps/web/supabase/migrations/0001_rls_policies.sql`
4. Click **"Run"**
5. Repeat with `apps/web/supabase/migrations/0002_auth_users_sync.sql`

## 8. Start the dev server

```bash
pnpm dev
```

Open <http://localhost:3000>.

## Troubleshooting

### `Error: Missing Supabase env vars`

You didn't complete step 4. Make sure `.env.local` exists in `apps/web/` and
has all four required values.

### `Error: ECONNREFUSED 127.0.0.1:5432`

The `DATABASE_URL` is pointing to localhost but Supabase is remote. Re-copy
the **Transaction pooler** URI from Supabase → Settings → Database.

### `relation "users" does not exist`

You didn't run `pnpm db:migrate` (step 6).

### Sign up works but user is not in the `users` table

You didn't apply the trigger from step 7 (`0002_auth_users_sync.sql`).

### `cookies should be awaited`

If you're using Next.js 14, the `cookies()` function doesn't return a
Promise. Upgrade to Next.js 15 or change `await cookies()` to `cookies()`.

## Next steps

Once everything is running:

- Read [docs/architecture.md](docs/architecture.md)
- Check the [issues labelled "good first issue"](https://github.com/open-innings/open-innings/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22)
- Join a [discussion](https://github.com/open-innings/open-innings/discussions)
