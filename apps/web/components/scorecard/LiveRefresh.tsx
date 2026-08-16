'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeps a live scorecard fresh, and tells the server this reader is here.
 *
 * Two jobs on one timer, because they want the same cadence and the same
 * condition: only while the tab is actually visible. A background tab that
 * kept polling would waste a phone's battery, and one that kept saying "still
 * watching" would inflate the number the scorer sees — which is worse, since
 * the whole point of that number is that it is true.
 *
 * v0.1 realtime strategy — WebSockets arrive in v0.3.
 */

const WATCHER_KEY = 'oi_watcher_key';

/**
 * A stable anonymous id for this browser.
 *
 * Identifies a browser so a heartbeat updates one row instead of inserting
 * one every ten seconds. It is not a person: nothing joins it to an account,
 * it is never sent anywhere else, and clearing site data creates a new one.
 */
function watcherKey(): string | null {
  try {
    const existing = localStorage.getItem(WATCHER_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(WATCHER_KEY, created);
    return created;
  } catch {
    // Private mode, or storage disabled. No key means no heartbeat, which
    // means this reader is not counted — a smaller failure than breaking the
    // page for the sake of a number.
    return null;
  }
}

export function LiveRefresh({
  intervalMs = 10_000,
  matchId,
}: {
  intervalMs?: number;
  /** Omit to poll without counting — a finished match has nothing to watch. */
  matchId?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      router.refresh();

      if (!matchId) return;
      const key = watcherKey();
      if (!key) return;

      void fetch(`/api/matches/${matchId}/watching`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watcherKey: key }),
        // The page is already refreshing itself; a failed heartbeat costs a
        // count, not a scorecard.
        keepalive: true,
      }).catch(() => {});
    };

    // Once immediately, so someone who opens a link and reads for thirty
    // seconds is counted rather than appearing only after the first interval.
    beat();
    const timer = setInterval(beat, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs, matchId]);

  return null;
}
