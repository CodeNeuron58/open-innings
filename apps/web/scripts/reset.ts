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

// Load .env.local in case DATABASE_URL isn't already in the env.
config({ path: resolve(process.cwd(), '.env.local') });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL is not set. Check .env.local.');
  process.exit(1);
}

// Safety: refuse to run against any URL that doesn't look like localhost.
if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
  console.error('✗ Refusing to reset a non-localhost database. Aborting.');
  console.error(`  DATABASE_URL = ${url}`);
  process.exit(1);
}

// Connect to the maintenance DB to drop/recreate the target DB.
const targetUrl = new URL(url);
const dbName = targetUrl.pathname.replace(/^\//, '');
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';

const sql = postgres(adminUrl.toString(), { prepare: false, max: 1 });

async function main() {
  console.log(`→ Dropping database "${dbName}"...`);
  // Terminate other connections so DROP can succeed.
  await sql.unsafe(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '${dbName}' AND pid <> pg_backend_pid();
  `);
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