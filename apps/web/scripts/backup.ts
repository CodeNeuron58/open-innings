/**
 * Take a database backup, now.
 *
 * ## Why this exists
 *
 * Heroku Postgres **Essential** tiers have no rollback and no continuous
 * protection — those start at Standard. So the only thing standing between a
 * bad migration and a lost season of scorecards is a dump somebody
 * remembered to take.
 *
 * Every figure in this app is derived from `ball_events`. Lose that table and
 * you have not lost a cache you can rebuild; you have lost the match.
 *
 * ## When to run it
 *
 * Before anything that changes the schema. `pnpm db:backup` takes seconds
 * against a database this size, and the one time you need it will be the one
 * time you skipped it.
 *
 * ## Heroku's own snapshots
 *
 * `heroku pg:backups:capture -a open-innings` also works on Essential tiers
 * and stores the dump on Heroku rather than your laptop. Retention is small,
 * so it is a safety net rather than an archive. Use both: theirs for "undo
 * the last hour", this one for "keep a copy off Heroku entirely".
 *
 * Run: pnpm db:backup            (uses DATABASE_URL from .env.local)
 *      DATABASE_URL="…" pnpm db:backup   (any other database)
 */
import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const BACKUP_DIR = resolve(process.cwd(), 'backups');

/** `2026-08-17T14-32-05` — sorts chronologically and is a legal filename. */
function stamp(): string {
  return new Date().toISOString().replace(/:/g, '-').replace(/\..+$/, '');
}

/** Hides the password when printing which database is being dumped. */
function describe(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`;
  } catch {
    return 'the configured database';
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local.');
    process.exit(1);
  }

  await mkdir(BACKUP_DIR, { recursive: true });
  const file = resolve(BACKUP_DIR, `open-innings-${stamp()}.dump`);

  console.log(`Dumping ${describe(url)}`);
  console.log(`  → ${file}`);

  /*
   * Custom format (-Fc), not plain SQL.
   *
   * It is compressed, and `pg_restore` can restore a single table from it —
   * which is what you actually want at 11pm when one table is wrong and the
   * rest of the database is fine.
   *
   * --no-owner and --no-acl because the roles on Heroku are not the roles
   * anywhere else, and a dump that insists on them will not restore locally.
   */
  const args = ['--format=custom', '--no-owner', '--no-acl', '--file', file, url];

  const child = spawn('pg_dump', args, { stdio: ['ignore', 'inherit', 'inherit'] });

  child.on('error', (err) => {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error('\npg_dump is not on PATH. Install the Postgres client tools.');
      console.error('Heroku alternative, no install needed:');
      console.error('  heroku pg:backups:capture -a open-innings');
    } else {
      console.error(err.message);
    }
    process.exit(1);
  });

  child.on('close', async (code) => {
    if (code !== 0) {
      console.error(`\npg_dump exited ${code}. Nothing was written.`);
      process.exit(code ?? 1);
    }

    /*
     * A dump that exists but is empty is worse than none, because it looks
     * like protection. pg_dump can exit 0 having written almost nothing if it
     * connected to the wrong database, so the size is checked rather than
     * assumed.
     */
    const { size } = await stat(file);
    if (size < 1024) {
      console.error(`\nThe dump is only ${size} bytes — that is not a database.`);
      console.error('Check DATABASE_URL points where you think it does.');
      process.exit(1);
    }

    console.log(`\n✓ ${(size / 1024).toFixed(0)} KB written.`);
    console.log('  Restore with:');
    console.log(`    pg_restore --clean --no-owner --dbname "$DATABASE_URL" "${file}"`);
  });
}

void main();
