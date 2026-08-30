/**
 * Keeps a spectator screen current, and tells the server this reader is here.
 *
 * The app-side twin of the web's LiveRefresh: the card fetched once on mount
 * was a snapshot, and a spectator following a close chase had to keep
 * pull-refreshing by hand while the web page updated itself every ten
 * seconds.
 *
 * Three rules, all the web's:
 *   - only while the match is live — a finished match has nothing to watch;
 *   - only while the app is actually in the foreground — a backgrounded timer
 *     wastes battery, and a heartbeat from a phone in a pocket inflates the
 *     number the scorer sees, which is worse, since the point of that number
 *     is that it is true;
 *   - a failed refresh or heartbeat costs a frame of staleness, not the screen.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { api } from './api';
import { watcherKey } from './watcher-key';

export function useLiveRefresh({
  live,
  matchId,
  refresh,
  intervalMs = 20_000,
}: {
  live: boolean;
  /** Omit to poll without counting — a finished match has nothing to watch. */
  matchId?: string;
  refresh: () => Promise<void>;
  intervalMs?: number;
}): void {
  const refreshRef = useRef(refresh);
  const matchIdRef = useRef(matchId);

  // Refs over deps: the interval below outlives any single refresh closure,
  // and re-creating it because a render handed us a new one is the churn this
  // is avoiding.
  useEffect(() => {
    refreshRef.current = refresh;
    matchIdRef.current = matchId;
  });

  useEffect(() => {
    if (!live) return;

    const beat = async () => {
      if (AppState.currentState !== 'active') return;
      try {
        await refreshRef.current();
      } catch {
        // A failed refresh costs a frame of staleness, not the screen.
      }
      const id = matchIdRef.current;
      if (!id) return;
      try {
        const key = await watcherKey();
        if (key) await api.watch(id, key);
      } catch {
        // A failed heartbeat costs a count, not a scorecard.
      }
    };

    // Once immediately, so someone who opens a link and reads for thirty
    // seconds is counted and current rather than waiting for the first
    // interval — and so a reader returning to the app sees the match as it
    // stands instead of up to an interval behind.
    void beat();
    const timer = setInterval(() => void beat(), intervalMs);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void beat();
    });

    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [live, intervalMs]);
}
