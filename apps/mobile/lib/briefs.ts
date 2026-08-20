/**
 * The one-line career context beside a name in a picker.
 */
import { useEffect, useState } from 'react';
import type { PlayerBrief, PlayerBriefsResponse } from '@open-innings/shared';
import { api } from './api';
import { useSession } from './session';

/**
 * Briefs for a squad, keyed by player id.
 * Fetched once per list. Returns an empty map on failure so pickers still work.
 */
/**
 * One shared empty map, not a fresh one per render.
 *
 * This is returned whenever there is nothing to look up, and a new `Map()`
 * each time would be a new identity each time — so every consumer's memo would
 * miss and every list would re-render for a value that never changed.
 */
const NONE: ReadonlyMap<string, PlayerBrief> = new Map();

export function usePlayerBriefs(playerIds: string[]): ReadonlyMap<string, PlayerBrief> {
  const { token } = useSession();

  // A stable key, so a re-render that produces an equal array doesn't refetch.
  const key = [...playerIds].sort().join(',');

  /*
   * The briefs are stored **with the key they belong to**, which is what makes
   * the empty case derivable rather than stored.
   *
   * This used to clear state from inside the effect body — the previous
   * comment admitted it cost a second render and called the fix "the empty
   * case could be derived rather than stored". It is now: a key change resets
   * during render, so React re-renders before committing instead of painting
   * the last squad's careers beside this squad's names.
   *
   * That stale frame was the real cost, not the extra render. A picker showing
   * the wrong career line next to a name is not obviously wrong to look at.
   */
  const [state, setState] = useState<{ key: string; briefs: ReadonlyMap<string, PlayerBrief> }>({
    key,
    briefs: NONE,
  });

  if (state.key !== key) {
    setState({ key, briefs: NONE });
  }

  useEffect(() => {
    // Nothing to fetch. State is already NONE for this key — set during
    // render above — so there is nothing to clear here either.
    if (!token || key.length === 0) return;

    const controller = new AbortController();
    let cancelled = false;

    api
      .playerBriefs(token, key.split(','), controller.signal)
      .then((res: PlayerBriefsResponse) => {
        if (cancelled) return;
        setState({ key, briefs: new Map(res.briefs.map((b) => [b.playerId, b])) });
      })
      .catch(() => {
        // Deliberately silent — a picker without career lines still picks.
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, key]);

  // Guard against a resolved response for a key we have since moved off.
  return state.key === key ? state.briefs : NONE;
}

/** Generates batting summary (e.g., "812 runs · 33 matches · SR 128"). Omits empty stats. */
export function battingLine(brief: PlayerBrief | undefined): string | null {
  if (!brief || brief.matches === 0) return null;

  const parts = [`${brief.runs} run${brief.runs === 1 ? '' : 's'}`];
  parts.push(`${brief.matches} match${brief.matches === 1 ? '' : 'es'}`);
  if (brief.battingBalls > 0) {
    parts.push(`SR ${((brief.runs / brief.battingBalls) * 100).toFixed(0)}`);
  }
  return parts.join('  ·  ');
}

/** Generates bowling summary (e.g., "24 wkts · econ 6.8"). */
export function bowlingLine(brief: PlayerBrief | undefined): string | null {
  if (!brief || brief.bowlingBalls === 0) return null;

  const parts = [`${brief.wickets} wkt${brief.wickets === 1 ? '' : 's'}`];
  parts.push(`econ ${(brief.bowlingRuns / (brief.bowlingBalls / 6)).toFixed(1)}`);
  return parts.join('  ·  ');
}
