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
import { isLocalConnection } from '../lib/db/ssl';

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

  const child = spawn('pg_dump', args, {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      PGSSLMODE: process.env.PGSSLMODE || (isLocalConnection(url) ? 'disable' : 'require'),
    },
  });

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

    /*
     * Then actually open it.
     *
     * The size check above is necessary and not sufficient: it was the only
     * verification here, and a file can be over a kilobyte and still be a
     * truncated archive that `pg_restore` refuses. This script then printed a
     * restore command it had never run, which is the shape of every backup
     * that turns out not to work on the night it is needed.
     *
     * `pg_restore --list` reads the archive's table of contents without
     * touching a database, so it is cheap and safe to run every time. It
     * proves the header is intact and the entries are readable — not that a
     * full restore succeeds, which needs a spare database, but far more than
     * a byte count.
     *
     * The table count comes from the same listing. Zero tables is the wrong-
     * database case that the size check was reaching for and can miss.
     */
    const toc = await listArchive(file);
    if (!toc.ok) {
      console.error(`\nThe dump was written but pg_restore cannot read it.`);
      console.error(toc.detail.trim().slice(0, 400));
      console.error('\nTreat this file as unusable.');
      process.exit(1);
    }

    if (toc.tables === 0) {
      console.error('\nThe archive is readable but contains no tables.');
      console.error('Check DATABASE_URL points where you think it does.');
      process.exit(1);
    }

    console.log(`\n✓ ${(size / 1024).toFixed(0)} KB written.`);
    // -1 means pg_restore could not be run at all; the warning is already out.
    if (toc.tables > 0) {
      console.log(`  Verified: pg_restore read the archive — ${toc.tables} tables.`);
    }
    console.log('  Restore with:');
    console.log(`    pg_restore --clean --no-owner --dbname "$DATABASE_URL" "${file}"`);
  });
}

/**
 * Read the archive's table of contents.
 *
 * Verification, not a formality — see the caller. Returns rather than throws
 * because a missing `pg_restore` is not the same failure as a corrupt file,
 * and only one of them means the backup is bad.
 */
function listArchive(
  file: string,
): Promise<{ ok: true; tables: number } | { ok: false; detail: string }> {
  return new Promise((done) => {
    const child = spawn('pg_restore', ['--list', file], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => (out += String(chunk)));
    child.stderr.on('data', (chunk) => (err += String(chunk)));

    child.on('error', (e) => {
      // pg_restore is shipped alongside pg_dump, so reaching here at all is
      // odd. Not a reason to condemn a dump that pg_dump reported as fine.
      const detail =
        (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'pg_restore is not on PATH' : e.message;
      console.warn(`\n! Could not verify the archive: ${detail}`);
      console.warn('  The dump was written but has not been opened. Check it by hand.');
      done({ ok: true, tables: -1 });
    });

    child.on('close', (code) => {
      if (code !== 0) return done({ ok: false, detail: err || `pg_restore exited ${code}` });
      // TOC lines look like: `123; 1259 16456 TABLE public ball_events oi`
      const tables = out.split('\n').filter((l) => / TABLE /.test(l)).length;
      done({ ok: true, tables });
    });
  });
}

void main();
