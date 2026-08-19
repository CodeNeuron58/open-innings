/**
 * Data fetching for authenticated screens.
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
 * A query against a **public** endpoint.
 * Runs with or without a token; does not sign out on 401.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo -- spread deps, needs refactor
    [token, ...deps],
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- triggers cascading render, needs refactor
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
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo -- spread deps, needs refactor
    [token, signOut, ...deps],
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- triggers cascading render, needs refactor
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
// Error codes for when a request loses a race and the client state is stale.
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
        // Handle conflict codes for lost races by notifying the caller to reload.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opts is a fresh closure
    [token, signOut],
  );

  return { run, busy, error, fieldError, setError };
}
