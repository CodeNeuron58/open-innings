/**
 * How many people are watching a match.
 *
 * The honest half of "follow". The designs put a follower count on the match
 * list, the innings break and the public scorecard, and what they wanted from
 * it was social proof for the scorer — somebody is watching the game you are
 * tapping through. A subscription would need push notifications to mean
 * anything, and there are none; presence needs nothing and is true now.
 *
 * So the label everywhere is **watching**, not following. They are different
 * claims and only one of them is supported.
 */
import 'server-only';
import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { matchWatchers } from '@/lib/db/schema';

/**
 * How recently someone must have checked in to count as watching.
 *
 * The web page heartbeats every ten seconds while its tab is visible, so two
 * minutes tolerates a few missed beats — a phone that slept in someone's
 * pocket, a tunnel — without keeping a number alive for anyone who closed the
 * tab and left.
 */
const WINDOW_MS = 2 * 60 * 1000;

/** Rows older than this are gone for good and are swept on write. */
const STALE_MS = 24 * 60 * 60 * 1000;

function since(): Date {
  return new Date(Date.now() - WINDOW_MS);
}

/** Record that a watcher is still here. Idempotent per (match, watcher). */
export async function markWatching(matchId: string, watcherKey: string): Promise<void> {
  await db
    .insert(matchWatchers)
    .values({ matchId, watcherKey })
    .onConflictDoUpdate({
      target: [matchWatchers.matchId, matchWatchers.watcherKey],
      set: { lastSeenAt: new Date() },
    });

  /*
   * Opportunistic sweep, roughly one write in fifty.
   *
   * The primary key stops a single watcher creating rows without limit, but
   * nothing stops a browser that clears storage from arriving with a new key
   * every visit. Without this the table only ever grows. Not awaited — a
   * heartbeat must not wait on housekeeping.
   */
  if (Math.random() < 0.02) {
    void db
      .delete(matchWatchers)
      .where(lt(matchWatchers.lastSeenAt, new Date(Date.now() - STALE_MS)))
      .catch(() => {});
  }
}

/** How many are watching one match. */
export async function countWatching(matchId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(matchWatchers)
    .where(and(eq(matchWatchers.matchId, matchId), gt(matchWatchers.lastSeenAt, since())));

  return Number(rows[0]?.n ?? 0);
}

/**
 * The same for a list of matches, in one query.
 *
 * The match list would otherwise ask once per row. Matches with nobody
 * watching are absent from the result rather than present as zero — the
 * caller defaults, and a `Map` lookup that misses is the same answer.
 */
export async function countWatchingFor(matchIds: string[]): Promise<Map<string, number>> {
  if (matchIds.length === 0) return new Map();

  const rows = await db
    .select({ matchId: matchWatchers.matchId, n: sql<number>`count(*)::int` })
    .from(matchWatchers)
    .where(and(inArray(matchWatchers.matchId, matchIds), gt(matchWatchers.lastSeenAt, since())))
    .groupBy(matchWatchers.matchId);

  return new Map(rows.map((r) => [r.matchId, Number(r.n)]));
}
