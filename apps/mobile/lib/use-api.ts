/**
 * Data fetching for authenticated screens.
 *
 * ## Why this was rewritten
 *
 * Both query hooks carried the same two suppressions, each admitting a real
 * problem in its own text:
 *
 *     eslint-disable react-hooks/exhaustive-deps, react-hooks/use-memo -- spread deps
 *     eslint-disable react-hooks/set-state-in-effect -- cascading render
 *
 * The first was `[token, ...deps]`: a dependency array whose *length* varies
 * with the caller. React compares dependency arrays positionally and assumes a
 * fixed size, so this is not merely unlintable — a caller passing a different
 * number of deps between renders reads the wrong slots. No caller does today,
 * which is luck rather than design. Deps are now folded into one stable string
 * and the array is a fixed size.
 *
 * The second was `setIsLoading(true)` inside the effect: render, commit,
 * effect, setState, render again — every screen paid an extra render pass on
 * every load, and the first of those passes showed stale data from the
 * previous query before the reset landed. Resetting during render instead is
 * React's documented answer for "derive state from a prop change", and it
 * re-renders before committing, so nothing paints the stale frame.
 *
 * Four `useState` calls also became one object. A load transition changes
 * three of them together, and as separate calls that is three chances for the
 * UI to observe a half-applied state.
 *
 * **Not runtime-verified.** There is no React renderer in this workspace (see
 * vitest.config.ts) and no device here, so this is typecheck- and
 * lint-verified only. It is the hook behind every screen: smoke it on hardware.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from './session';
import { ApiError, NetworkError } from './api';

type Fetcher<T> = (token: string, signal?: AbortSignal) => Promise<T>;

type QueryResult<T> = {
  data: T | null;
  error: string | null;
  /** True on the first load only — refreshes shouldn't blank the screen. */
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
};

type QueryState<T> = {
  data: T | null;
  error: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
};

const fresh = <T>(): QueryState<T> => ({
  data: null,
  error: null,
  isLoading: true,
  isRefreshing: false,
});

/** What to show when something that is not an ApiError or NetworkError escapes. */
function messageFor(err: unknown): string {
  return err instanceof NetworkError || err instanceof ApiError
    ? err.message
    : 'Something went wrong.';
}

/**
 * The shared machinery behind both query hooks.
 *
 * `fetcher` and `onError` are held in refs rather than in the dependency
 * array. Every call site passes an inline arrow, so both are new objects on
 * every render — depending on them directly would re-run the request on each
 * render, which is the bug the spread-deps array was quietly avoiding by
 * ignoring them.
 *
 * `onError` returns the message to display, or null when it has handled the
 * failure itself and nothing should be shown — which is how the authenticated
 * hook signs out on a 401 without also flashing an error the user cannot act
 * on.
 */
function useQueryCore<T>(
  fetcher: (signal?: AbortSignal) => Promise<T>,
  onError: (err: unknown) => Promise<string | null>,
  key: string,
  /** False when there is nothing to fetch with — no token, typically. */
  enabled: boolean,
): QueryResult<T> {
  const fetcherRef = useRef(fetcher);
  const onErrorRef = useRef(onError);

  /*
   * Refs are updated in an effect, not during render — writing to one while
   * rendering is what `react-hooks/refs` forbids, and the compiler is right
   * that it is unsound in a concurrent render.
   *
   * Declared BEFORE the load effect on purpose: effects fire in declaration
   * order, so by the time the request is issued below these already hold the
   * current closures.
   */
  useEffect(() => {
    fetcherRef.current = fetcher;
    onErrorRef.current = onError;
  });

  const [state, setState] = useState<QueryState<T>>(() => ({ ...fresh<T>(), isLoading: enabled }));
  const [activeKey, setActiveKey] = useState(key);

  /*
   * Reset during render, not in an effect.
   *
   * When the key changes this component is showing another query's data, and
   * an effect would let that paint first. Setting state during render makes
   * React discard this pass and re-render immediately with the reset applied,
   * before anything is committed. It is the pattern React documents for
   * exactly this, and it is why `set-state-in-effect` no longer needs
   * suppressing.
   */
  if (key !== activeKey) {
    setActiveKey(key);
    setState({ ...fresh<T>(), isLoading: enabled });
  }

  const load = useCallback(async (signal?: AbortSignal, refreshing = false) => {
    if (refreshing) setState((s) => ({ ...s, isRefreshing: true, error: null }));

    try {
      const data = await fetcherRef.current(signal);
      if (signal?.aborted) return;
      setState({ data, error: null, isLoading: false, isRefreshing: false });
    } catch (err) {
      if (signal?.aborted) return;
      const message = await onErrorRef.current(err);
      setState((s) => ({ ...s, error: message, isLoading: false, isRefreshing: false }));
    }
  }, []);

  useEffect(() => {
    // Signed out: `isLoading` was already initialised false, so there is
    // nothing to set and nothing to fetch.
    if (!enabled) return;

    const controller = new AbortController();
    /*
     * The one place state is set from an effect, and it is the definition of
     * data fetching rather than an oversight: the request is issued here and
     * its result lands after an await, on a later tick. `set-state-in-effect`
     * cannot distinguish that from setting state synchronously during the
     * effect, which is the thing actually worth forbidding — and which the
     * `enabled` branch above removed.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async completion, not a synchronous cascade
    void load(controller.signal);
    return () => controller.abort();
    // `key` is the whole identity of this query; `load` is stable.
  }, [key, load, enabled]);

  const refresh = useCallback(async () => {
    await load(undefined, true);
  }, [load]);

  return { ...state, refresh };
}

/**
 * Deps as one value, so the dependency array has a fixed size.
 *
 * Call sites pass ids and flags, which stringify cheaply and compare by value
 * — which is what was wanted all along. An object with unstable key order
 * would defeat it, so keep passing primitives.
 */
function keyOf(token: string | null, deps: unknown[]): string {
  return `${token ?? ''}|${JSON.stringify(deps)}`;
}

/**
 * A query against a **public** endpoint.
 * Runs with or without a token; does not sign out on 401.
 */
export function usePublicQuery<T>(
  fetcher: (token: string | null, signal?: AbortSignal) => Promise<T>,
  deps: unknown[] = [],
): QueryResult<T> {
  const { token } = useSession();

  return useQueryCore<T>(
    (signal) => fetcher(token, signal),
    async (err) => messageFor(err),
    keyOf(token, deps),
    // Public: a missing token is a valid way to call these.
    true,
  );
}

export function useApiQuery<T>(fetcher: Fetcher<T>, deps: unknown[] = []): QueryResult<T> {
  const { token, signOut } = useSession();

  return useQueryCore<T>(
    (signal) => fetcher(token as string, signal),
    async (err) => {
      // The session died while the app was open. Sign out so the guard
      // redirects, rather than leaving the user staring at an error they
      // can't resolve — and show nothing, because the redirect is the answer.
      if (err instanceof ApiError && err.isUnauthenticated) {
        await signOut();
        return null;
      }
      return messageFor(err);
    },
    keyOf(token, deps),
    token !== null,
  );
}

/**
 * The mutation counterpart: tracks in-flight state and surfaces a message.
 * Returns the result so callers can navigate with it.
 */
/*
 * Errors that mean "your copy of the state is behind", not "your request was
 * wrong". The caller reloads and carries on rather than showing a banner.
 *
 * STALE_INNINGS and DUPLICATE_REQUEST arrived with the idempotency work in
 * migration 0013 and the optimistic guard in `recordBall`. Both are 409s that
 * a scorer can recover from by refreshing, and without them here a correction
 * landing from another device would surface as a flat error mid-over.
 */
const CONFLICT_CODES = new Set([
  'DUPLICATE_BALL',
  'ALREADY_UNDONE',
  'STALE_INNINGS',
  'DUPLICATE_REQUEST',
]);

export function useApiMutation(opts: { onConflict?: (code: string) => void } = {}) {
  const { token, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);

  // `opts` is a fresh object literal on every render at every call site, so it
  // is held rather than depended on — the previous version suppressed the lint
  // rule to say the same thing.
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const run = useCallback(
    async <T>(action: (token: string) => Promise<T>): Promise<T | null> => {
      if (!token) return null;
      setBusy(true);
      setError(null);
      setFieldError(null);
      try {
        return await action(token);
      } catch (err) {
        if (err instanceof ApiError && err.isUnauthenticated) {
          await signOut();
          return null;
        }
        // Handle conflict codes for lost races by notifying the caller to reload.
        if (err instanceof ApiError && err.status === 409 && err.code) {
          const onConflict = optsRef.current.onConflict;
          if (onConflict && CONFLICT_CODES.has(err.code)) {
            onConflict(err.code);
            return null;
          }
        }
        // A field-scoped failure belongs under its input, not in a banner.
        if (err instanceof ApiError && err.field) {
          setFieldError({ field: err.field, message: err.message });
        } else if (err instanceof NetworkError || err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Something went wrong.');
        }
        return null;
      } finally {
        setBusy(false);
      }
    },
    [token, signOut],
  );

  return { run, busy, error, fieldError, setError };
}
