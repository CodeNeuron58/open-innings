/**
 * Open Innings — destructive dev reset.
 *
 * Drops and recreates the database, then reapplies all migrations.
 *
 * ⚠️ DESTRUCTIVE: this will delete ALL data in the target database.
 * Intended only for local dev. Refuses to run against production-like
 * connection strings.
 *
 * Run with: pnpm db:reset
 */
import postgres from 'postgres';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { isLocalConnection } from '../lib/db/ssl';

// Load .env.local in case DATABASE_URL isn't already in the env.
config({ path: resolve(process.cwd(), '.env.local') });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL is not set. Check .env.local.');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  console.error('✗ Refusing to reset with NODE_ENV=production. Aborting.');
  process.exit(1);
}

/*
 * The host, and only the host.
 *
 * This was `url.includes('localhost')`, a substring test against the entire
 * connection string, so a password or a database name containing "localhost"
 * waved a remote database straight through to DROP DATABASE below.
 *
 * The dangerous case is not exotic. Reaching a Heroku Postgres from a laptop
 * means an SSH tunnel or `heroku pg:psql`, and both of those connect via
 * localhost:5432 — so the honest reading is that this guard cannot tell a
 * tunnel from a real local database. Hence the second check: the tunnel
 * points at a database whose name is not the local one.
 */
if (!isLocalConnection(url)) {
  console.error('✗ Refusing to reset a non-local database. Aborting.');
  console.error(
    `  host = ${(() => {
      try {
        return new URL(url).hostname;
      } catch {
        return '(unparseable)';
      }
    })()}`,
  );
  process.exit(1);
}

// Connect to the maintenance DB to drop/recreate the target DB.
const targetUrl = new URL(url);
const dbName = decodeURIComponent(targetUrl.pathname.replace(/^\//, ''));

/*
 * `dbName` reaches `sql.unsafe()` as an interpolated identifier, and this
 * script runs as a superuser. A database name containing a quote would be
 * arbitrary SQL, so it has to look like an identifier before it gets there.
 */
if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
  console.error(`✗ Refusing to act on an unsafe database name: ${JSON.stringify(dbName)}`);
  process.exit(1);
}

if (!/(^|_)open_innings(_|$)|^postgres$/.test(dbName) && !process.env.OI_RESET_ANY_DB) {
  console.error(`✗ "${dbName}" is not a recognised Open Innings database.`);
  console.error('  A localhost port-forward to a remote database looks local to this check.');
  console.error('  If you are certain, re-run with OI_RESET_ANY_DB=1.');
  process.exit(1);
}

const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';

const sql = postgres(adminUrl.toString(), { prepare: false, max: 1 });

async function main() {
  console.log(`→ Dropping database "${dbName}"...`);
  // Terminate other connections so DROP can succeed. `datname` is a value,
  // so it binds as a parameter rather than being pasted into the statement.
  await sql`
    select pg_terminate_backend(pid)
    from pg_stat_activity
    where datname = ${dbName} and pid <> pg_backend_pid()
  `;
  await sql.unsafe(`DROP DATABASE IF EXISTS "${dbName}";`);

  console.log(`→ Creating database "${dbName}"...`);
  await sql.unsafe(`CREATE DATABASE "${dbName}";`);

  await sql.end();

  console.log('✓ Database reset. Now run: pnpm db:migrate && pnpm db:seed');
  process.exit(0);
}

main().catch((err) => {
  console.error('✗ Reset failed:', err);
  process.exit(1);
});
