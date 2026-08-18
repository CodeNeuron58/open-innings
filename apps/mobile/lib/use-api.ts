/**
 * Data fetching for authenticated screens.
 *
 * Every list screen needs the same four things: load on mount, a spinner, an
 * error the user can act on, and pull-to-refresh. Without this they each grow
 * their own slightly different version and the 401 case gets forgotten in one
 * of them — which is the one that strands a user on a dead screen.
 */
import { useCallback, useEffect, useState } from 'react';
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

/**
 * A query against a **public** endpoint — the scorecard, a career, a club.
 *
 * Runs with or without a token, because those endpoints do. That is what
 * lets a guest read a shared link: they have no credential, and the server
 * was never going to ask for one.
 *
 * It also does not sign anyone out on a 401. `useApiQuery` does that because
 * a 401 there means a dead session; here it would mean the endpoint is not
 * actually public, which is a bug to see rather than a user to eject.
 */
export function usePublicQuery<T>(
  fetcher: (token: string | null, signal?: AbortSignal) => Promise<T>,
  deps: unknown[] = [],
): QueryResult<T> {
  const { token } = useSession();

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const run = useCallback(
    async (signal?: AbortSignal) => {
      setError(null);
      try {
        setData(await fetcher(token, signal));
      } catch (err) {
        if (signal?.aborted) return;
        setError(
          err instanceof NetworkError || err instanceof ApiError
            ? err.message
            : 'Something went wrong.',
        );
      }
    },
    // A spread dep array is opaque to React's static analysis, so neither
    // exhaustive-deps nor use-memo can verify it. Known and not yet fixed:
    // the fix is to hash `deps` into a single stable key, and it changes when
    // every screen refetches — so it needs verifying against a running app.
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo -- known: spread deps, needs a verified refactor
    [token, ...deps],
  );

  useEffect(() => {
    const controller = new AbortController();
    // Known and not yet fixed: setting state in an effect body triggers a
    // second render pass on every fetch. Correct shape is to derive loading
    // from the request rather than store it. Behaviour is right today, so
    // this waits for a session where the app can be run to prove the change.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- known: cascading render, needs a verified refactor
    setIsLoading(true);
    void run(controller.signal).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false);
    });
    return () => controller.abort();
  }, [run]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await run();
    setIsRefreshing(false);
  }, [run]);

  return { data, error, isLoading, isRefreshing, refresh };
}

export function useApiQuery<T>(fetcher: Fetcher<T>, deps: unknown[] = []): QueryResult<T> {
  const { token, signOut } = useSession();

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const run = useCallback(
    async (signal?: AbortSignal) => {
      if (!token) return;
      setError(null);
      try {
        setData(await fetcher(token, signal));
      } catch (err) {
        if (signal?.aborted) return;

        // The session died while the app was open. Sign out so the guard
        // redirects, rather than leaving the user staring at an error they
        // can't resolve.
        if (err instanceof ApiError && err.isUnauthenticated) {
          await signOut();
          return;
        }

        setError(
          err instanceof NetworkError || err instanceof ApiError
            ? err.message
            : 'Something went wrong.',
        );
      }
    },
    // Same spread-deps limitation as usePublicQuery above — see the note there.
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo -- known: spread deps, needs a verified refactor
    [token, signOut, ...deps],
  );

  useEffect(() => {
    const controller = new AbortController();
    // Same cascading-render issue as usePublicQuery above — see the note there.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- known: cascading render, needs a verified refactor
    setIsLoading(true);
    void run(controller.signal).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false);
    });
    return () => controller.abort();
  }, [run]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await run();
    setIsRefreshing(false);
  }, [run]);

  return { data, error, isLoading, isRefreshing, refresh };
}

/**
 * The mutation counterpart: tracks in-flight state and surfaces a message.
 * Returns the result so callers can navigate with it.
 */
/**
 * Codes the server sends when the request lost a race rather than being wrong.
 *
 * Both mean the same thing to a scorer: the server already knows about this,
 * and what is on screen is stale. Retrying cannot succeed and an error banner
 * describes the wrong problem — the answer is to reload and carry on.
 */
const CONFLICT_CODES = new Set(['DUPLICATE_BALL', 'ALREADY_UNDONE']);

export function useApiMutation(opts: { onConflict?: (code: string) => void } = {}) {
  const { token, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);

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
        /*
         * The request lost a race. A double tap on a ball, or an undo that a
         * second tap already performed — the server refuses the duplicate,
         * correctly, and the screen is simply behind. Handing this to the
         * caller lets it refresh instead of showing an error for something
         * that is not the scorer's mistake, and stops a retry loop that could
         * never succeed.
         */
        if (err instanceof ApiError && err.status === 409 && err.code) {
          if (opts.onConflict && CONFLICT_CODES.has(err.code)) {
            opts.onConflict(err.code);
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
    // `opts.onConflict` is read inside and is a fresh closure each render;
    // depending on it would rebuild `run` every time and defeat the memo. The
    // callers pass a stable handler, and a stale one would only mean a refresh
    // fired against the previous render's data — which is what it does anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [token, signOut],
  );

  return { run, busy, error, fieldError, setError };
}
