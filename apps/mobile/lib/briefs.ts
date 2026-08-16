/**
 * The one-line career context beside a name in a picker.
 *
 * One place, because three screens show it — the XI picker, the openers
 * picker, and the add-a-player search — and a batter who reads "SR 128" on one
 * and "SR 127.6" on another looks like a bug in the figures rather than a
 * difference in rounding.
 */
import { useEffect, useState } from 'react';
import type { PlayerBrief, PlayerBriefsResponse } from '@open-innings/shared';
import { api } from './api';
import { useSession } from './session';

/**
 * Briefs for a squad, keyed by player id.
 *
 * Fetched once per list rather than per row. Returns an empty map until they
 * arrive and on failure — the context is a nicety, and a picker must still
 * work when it cannot be loaded. Nothing here surfaces an error, because a
 * scorer trying to name an XI does not need to be told that a strike rate is
 * missing.
 */
export function usePlayerBriefs(playerIds: string[]): Map<string, PlayerBrief> {
  const { token } = useSession();
  const [briefs, setBriefs] = useState<Map<string, PlayerBrief>>(new Map());

  // A stable key, so a re-render that produces an equal array doesn't refetch.
  const key = [...playerIds].sort().join(',');

  useEffect(() => {
    if (!token || key.length === 0) {
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

/**
 * "812 runs · 33 matches · SR 128" — what a captain reads to tell two
 * S. Kuriens apart.
 *
 * Every clause is dropped when it would be empty rather than rendered as a
 * zero: "0 runs · SR 0" describes a player who has never batted the same way
 * it describes one who is out of form, and those are different people.
 */
export function battingLine(brief: PlayerBrief | undefined): string | null {
  if (!brief || brief.matches === 0) return null;

  const parts = [`${brief.runs} run${brief.runs === 1 ? '' : 's'}`];
  parts.push(`${brief.matches} match${brief.matches === 1 ? '' : 'es'}`);
  if (brief.battingBalls > 0) {
    parts.push(`SR ${((brief.runs / brief.battingBalls) * 100).toFixed(0)}`);
  }
  return parts.join('  ·  ');
}

/** "24 wkts · econ 6.8" — the same idea from the other end. */
export function bowlingLine(brief: PlayerBrief | undefined): string | null {
  if (!brief || brief.bowlingBalls === 0) return null;

  const parts = [`${brief.wickets} wkt${brief.wickets === 1 ? '' : 's'}`];
  parts.push(`econ ${(brief.bowlingRuns / (brief.bowlingBalls / 6)).toFixed(1)}`);
  return parts.join('  ·  ');
}
