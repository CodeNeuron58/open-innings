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
export function usePlayerBriefs(playerIds: string[]): Map<string, PlayerBrief> {
  const { token } = useSession();
  const [briefs, setBriefs] = useState<Map<string, PlayerBrief>>(new Map());

  // A stable key, so a re-render that produces an equal array doesn't refetch.
  const key = [...playerIds].sort().join(',');

  useEffect(() => {
    if (!token || key.length === 0) {
      // Known and not yet fixed: clearing state inside the effect body costs a
      // second render. The empty case could be derived rather than stored.
      // Harmless today — it only fires when there are no players to look up.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- known: cascading render, needs a verified refactor
      setBriefs(new Map());
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    api
      .playerBriefs(token, key.split(','), controller.signal)
      .then((res: PlayerBriefsResponse) => {
        if (cancelled) return;
        setBriefs(new Map(res.briefs.map((b) => [b.playerId, b])));
      })
      .catch(() => {
        // Deliberately silent — see the note above.
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, key]);

  return briefs;
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
