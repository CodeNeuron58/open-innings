/**
 * Open Innings — minimal migration runner.
 *
 * Why not drizzle-kit migrate? Drizzle's migrator reads its journal from
 * `supabase/migrations/meta/_journal.json` and expects generated snapshots.
 * We have hand-written SQL files (RLS policies, column tweaks) interleaved
 * with generated ones — keeping the journal in sync by hand is error-prone.
 *
 * This runner is simpler: it tracks which SQL files have run in a Postgres
 * table and executes the rest in lexical order. Re-running is a no-op.
 */
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { config } from 'dotenv';

// Load .env.local first (Next.js convention), then .env as a fallback.
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local.');
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });

  try {
    // Track which migrations have run.
    await sql`
      create table if not exists __open_innings_migrations (
        name text primary key,
        run_at timestamptz not null default now()
      )
    `;

    const allFiles = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

    const applied = new Set(
      (await sql<{ name: string }[]>`select name from __open_innings_migrations`).map(
        (r) => r.name,
      ),
    );

    const pending = allFiles.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('✓ Nothing to migrate. Database is up to date.');
      return;
    }

    console.log(`→ Applying ${pending.length} migration(s):`);
    for (const file of pending) {
      const path = resolve(MIGRATIONS_DIR, file);
      const contents = await readFile(path, 'utf8');
      process.stdout.write(`  ${file} ... `);
      try {
        await sql.unsafe(contents);
        await sql`insert into __open_innings_migrations (name) values (${file})`;
        process.stdout.write('ok\n');
      } catch (err) {
        process.stdout.write('FAIL\n');
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\n✗ Migration ${file} failed:\n${msg}`);
        process.exit(1);
      }
    }

    console.log('✓ All migrations applied.');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
