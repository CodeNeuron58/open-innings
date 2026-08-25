/**
 * Finding a cricketer before inventing one.
 *
 * The rule this exists to keep in one place: **search first, create second.**
 * A club scoring a player who already exists somewhere else must attach to
 * that person rather than making a second row, or the career splits in two and
 * nothing can join it again — which is the bug `searchPlayersByName` was
 * widened across accounts to prevent.
 *
 * Three parts of that are easy to get subtly wrong, and all three are here:
 *
 *   The search is **debounced**. Typing a name is six or seven keystrokes and
 *   this leaves the phone; a request per keystroke on ground-side mobile data
 *   feels worse than a screen that cannot find anybody.
 *
 *   Somebody already in the squad is **filtered out**. They are not a search
 *   result, they are the answer to a question nobody asked.
 *
 *   "Create" is offered **only once the server has answered**. Offering it
 *   while a request is still out is precisely how a duplicate gets made — the
 *   scorer types a name, sees nothing yet, and taps create.
 *
 * The add-player screen had all of this and the match wizard had none, because
 * the wizard could not create a player at all — it navigated away to that
 * screen and left the draft behind. Now both use this, and there is one
 * answer to "does this person already exist".
 */
import { useEffect, useMemo, useState } from 'react';
import type { PlayerRole, PlayerSearchResult } from '@open-innings/shared';
import { api } from './api';
import { useApiQuery, useApiMutation } from './use-api';

/** The server refuses anything shorter, so there is no point asking. */
export const MIN_QUERY = 2;

export type PlayerFinder = {
  search: string;
  setSearch: (v: string) => void;
  /** Existing players who are not already in this squad. */
  matches: PlayerSearchResult[];
  /** A request is out. Not the same as "nobody was found". */
  searching: boolean;
  /** The server answered and found nobody — the only time create is safe. */
  noMatches: boolean;
  /**
   * More people match than were returned.
   *
   * Worth surfacing: a scorer who cannot see the person they mean will create
   * a duplicate, and "narrow it" is the one instruction that prevents that.
   */
  truncated: boolean;
  busy: boolean;
  error: string | null;
  addExisting: (playerId: string) => Promise<boolean>;
  createAndAdd: (fullName: string, role?: PlayerRole | null) => Promise<boolean>;
};

export function usePlayerFinder({
  teamId,
  squadIds,
  onAdded,
}: {
  teamId: string | null;
  /** Who is already on this club's books. */
  squadIds: ReadonlySet<string>;
  /** Called with the player who was just attached, so the caller can react. */
  onAdded?: (playerId: string) => void;
}): PlayerFinder {
  const mutation = useApiMutation();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const trimmed = search.trim();
    const timer = setTimeout(() => setQuery(trimmed), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const results = useApiQuery(
    (t, signal) =>
      query.length >= MIN_QUERY
        ? api.searchPlayers(t, query, { scope: 'all', limit: 10, signal })
        : Promise.resolve({ players: [], scope: 'all' as const, truncated: false }),
    [query],
  );

  const matches = useMemo(
    () => (results.data?.players ?? []).filter((p) => !squadIds.has(p.id)),
    [results.data, squadIds],
  );

  const searching = query.length >= MIN_QUERY && results.isLoading;
  const truncated = results.data?.truncated ?? false;
  const noMatches = query.length >= MIN_QUERY && !searching && matches.length === 0;

  async function addExisting(playerId: string): Promise<boolean> {
    if (!teamId) return false;
    const done = await mutation.run((t) => api.addTeamMember(t, teamId, playerId));
    if (done === null) return false;
    setSearch('');
    onAdded?.(playerId);
    return true;
  }

  async function createAndAdd(fullName: string, role?: PlayerRole | null): Promise<boolean> {
    const name = fullName.trim();
    if (!teamId || name.length === 0) return false;

    const created = await mutation.run((t) =>
      api.createPlayer(t, { fullName: name, ...(role ? { role } : {}) }),
    );
    if (!created) return false;

    const done = await mutation.run((t) => api.addTeamMember(t, teamId, created.player.id));
    if (done === null) return false;

    setSearch('');
    onAdded?.(created.player.id);
    return true;
  }

  return {
    search,
    setSearch,
    matches,
    searching,
    noMatches,
    truncated,
    busy: mutation.busy,
    error: mutation.error,
    addExisting,
    createAndAdd,
  };
}

/**
 * A career in one line, from what the search already returned.
 *
 * Deliberately not a second request — the search carries these figures, and a
 * scorer choosing between two people with the same name is choosing on them.
 */
export function careerLine(p: PlayerSearchResult): string {
  const parts: string[] = [];
  if (p.matches > 0) parts.push(`${p.matches} ${p.matches === 1 ? 'match' : 'matches'}`);
  if (p.runs > 0) parts.push(`${p.runs} runs`);
  if (p.wickets > 0) parts.push(`${p.wickets} wkts`);
  if (parts.length === 0) return 'No matches yet';
  return parts.join('  ·  ');
}
