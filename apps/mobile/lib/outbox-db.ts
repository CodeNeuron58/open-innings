/**
 * Where unsynced deliveries live between taps.
 *
 * SQLite rather than a key-value blob, for one reason: a delivery that has
 * been tapped must survive the app dying. A scorer at a ground is holding a
 * phone in one hand for three hours, and force-quits, battery deaths and
 * OS-initiated kills all happen mid-over. Rewriting a whole JSON array on
 * every ball has a window where a crash loses the tail of the queue, and the
 * tail is the part nobody has seen the server acknowledge.
 *
 * Every write here is a single statement, so it either happened or it did not.
 *
 * ## No logic lives here
 *
 * Ordering, deduplication, projection and retry policy are all in `outbox.ts`,
 * which is pure and tested. This file is the disk, and nothing else — that
 * split is deliberate, because the interesting half cannot be unit-tested
 * through a native module.
 *
 * ## Failure is not fatal
 *
 * Every function swallows its errors and reports the failure by returning
 * rather than throwing. Losing the ability to *persist* the queue is bad; it
 * is not as bad as taking the console down mid-over, and an in-memory queue
 * still scores the match for as long as the app stays up.
 */
import * as SQLite from 'expo-sqlite';
import type { BallEventInput } from '@open-innings/scoring';
import type { PendingBall } from './outbox';

const DB_NAME = 'open-innings.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function open(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    // WAL, because the drain loop reads while the console writes.
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS outbox (
        request_id TEXT PRIMARY KEY,
        match_id   TEXT NOT NULL,
        seq        INTEGER NOT NULL,
        ball       TEXT NOT NULL,
        queued_at  INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS outbox_match_seq_idx ON outbox (match_id, seq);
    `);
    return db;
  })();

  return dbPromise;
}

type Row = {
  request_id: string;
  match_id: string;
  seq: number;
  ball: string;
  queued_at: number;
};

/**
 * Everything this match has queued and not had confirmed, oldest first.
 *
 * A row whose payload will not parse is dropped rather than allowed to stop
 * the load: it cannot be sent and it cannot be folded, so keeping it would
 * only block every delivery behind it.
 */
export async function loadOutbox(matchId: string): Promise<PendingBall[]> {
  try {
    const db = await open();
    const rows = await db.getAllAsync<Row>(
      'SELECT request_id, match_id, seq, ball, queued_at FROM outbox WHERE match_id = ? ORDER BY seq ASC',
      matchId,
    );

    const out: PendingBall[] = [];
    for (const row of rows) {
      try {
        out.push({
          seq: row.seq,
          requestId: row.request_id,
          ball: JSON.parse(row.ball) as BallEventInput,
          queuedAt: row.queued_at,
        });
      } catch {
        void removeBall(row.request_id);
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Persist one delivery.
 *
 * `INSERT OR IGNORE`, so a resend of an id already queued is not a second
 * ball. That is the same rule `enqueue` applies in memory, stated again here
 * because the database is what survives a restart and it has to be true on
 * disk too.
 *
 * Returns whether it is safely stored, so the caller can tell a scorer that
 * their queue is memory-only rather than let them believe otherwise.
 */
export async function saveBall(matchId: string, item: PendingBall): Promise<boolean> {
  try {
    const db = await open();
    await db.runAsync(
      'INSERT OR IGNORE INTO outbox (request_id, match_id, seq, ball, queued_at) VALUES (?, ?, ?, ?, ?)',
      item.requestId,
      matchId,
      item.seq,
      JSON.stringify(item.ball),
      item.queuedAt,
    );
    return true;
  } catch {
    return false;
  }
}

/** The server has it, or it was undone before it ever left. */
export async function removeBall(requestId: string): Promise<void> {
  try {
    const db = await open();
    await db.runAsync('DELETE FROM outbox WHERE request_id = ?', requestId);
  } catch {
    /* an orphan row is re-sent and answered idempotently; it is not a crash */
  }
}

/** Everything for this match, for when the queue is abandoned wholesale. */
export async function clearOutbox(matchId: string): Promise<void> {
  try {
    const db = await open();
    await db.runAsync('DELETE FROM outbox WHERE match_id = ?', matchId);
  } catch {
    /* see removeBall */
  }
}

/**
 * How many deliveries are waiting, across every match.
 *
 * For the match list, so a scorer who closed a match mid-over is told there is
 * something still to send rather than discovering it a week later.
 */
export async function totalPending(): Promise<number> {
  try {
    const db = await open();
    const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox');
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}
