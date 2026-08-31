/**
 * Session state for the app.
 * Token is stored in expo-secure-store and verified server-side on launch.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { AuthResponse } from '@open-innings/shared';
import { api, ApiError } from './api';
import { logOutPurchases } from './purchases';

const TOKEN_KEY = 'oi_session_token';

// The signed-in profile, cached beside the token.
//
// The launch check used to be network-first: a stored token validated against
// the server before the app let anyone in, and offline that validation failed
// — so a scorer at a ground with no signal, holding a perfectly good token,
// landed on the login screen. Which could not load either. The snapshot makes
// the cache the answer: launch restores it instantly, the server revalidates
// in the background, and "offline" stops being "logged out". It is a name and
// an email, nothing sensitive beyond what the token already protects, and
// clearing the app's data clears both.
const USER_KEY = 'oi_user_snapshot';

type Snapshot = { user: User; playerId: string | null };

/** Write the cached profile. Failure is non-fatal — the token is the credential. */
async function persist(snapshot: Snapshot): Promise<void> {
  try {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(snapshot));
  } catch {
    /* the next successful session check rewrites it */
  }
}

// "This person chose to look around without an account."
// Persisted so the guest prompt is not shown on every launch.
const GUEST_KEY = 'oi_guest_mode';

type User = AuthResponse['user'];

type SessionState = {
  /** null once we know nobody is signed in; undefined while still checking. */
  user: User | null | undefined;
  token: string | null;
  /** True if the user is exploring without an account (read-only mode). */
  isGuest: boolean;
  /** Which player on the field this account is, if claimed. */
  playerId: string | null;
  /** Re-read the session from the server (e.g., to update email verification status). */
  refreshSession: () => Promise<void>;
  /** True until the stored token has been checked against the server. */
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [token, setToken] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore on launch.
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!stored) {
          // No credential. Restore the guest choice if one was made, so the
          // welcome screen is not the first thing a returning browser sees.
          setIsGuest((await SecureStore.getItemAsync(GUEST_KEY)) === '1');
          setUser(null);
          return;
        }

        // Cached profile first, so launch does not wait on the network at all
        // — and does not fail on it. The server check below still runs, and
        // corrects the cache when it can.
        let restored = false;
        const cached = await SecureStore.getItemAsync(USER_KEY);
        if (cached) {
          try {
            const snap = JSON.parse(cached) as Snapshot;
            setToken(stored);
            setUser(snap.user);
            setPlayerId(snap.playerId);
            restored = true;
          } catch {
            /* an unparseable snapshot is no snapshot */
          }
        }

        try {
          const result = await api.session(stored, controller.signal);
          if (controller.signal.aborted) return;
          if (result.user) {
            setToken(stored);
            setUser(result.user);
            setPlayerId(result.playerId);
            void persist({ user: result.user, playerId: result.playerId });
          } else {
            // Revoked or expired server-side — don't keep a dead credential.
            await SecureStore.deleteItemAsync(TOKEN_KEY);
            await SecureStore.deleteItemAsync(USER_KEY);
            setUser(null);
            setToken(null);
          }
        } catch {
          if (controller.signal.aborted) return;
          if (restored) {
            // Offline with a cached profile: stay signed in. The token is
            // intact; the first online request revalidates it, and a revoked
            // one is handled there (401 → sign out) rather than here, where
            // it cannot be distinguished from a dropped connection anyway.
          } else {
            // Legacy install: a token but no snapshot. Keep the token, land
            // on login this once — the snapshot exists from the next sign-in.
            setUser(null);
          }
        }
      } catch {
        if (!controller.signal.aborted) setUser(null);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  const adopt = useCallback(async (auth: AuthResponse) => {
    await SecureStore.setItemAsync(TOKEN_KEY, auth.token);
    // Signing in supersedes browsing. Leaving the flag set would keep the
    // app drawing "sign in to do this" prompts at someone who just did.
    await SecureStore.deleteItemAsync(GUEST_KEY);
    setIsGuest(false);
    setToken(auth.token);
    setUser(auth.user);
    // From this moment the profile survives an offline launch.
    void persist({ user: auth.user, playerId: null });
    // A fresh sign-in does not know yet; the session call fills it in.
    void api
      .session(auth.token)
      .then((s) => {
        setPlayerId(s.playerId);
        void persist({ user: auth.user, playerId: s.playerId });
      })
      .catch(() => {});
  }, []);

  const refreshSession = useCallback(async () => {
    if (!token) return;
    try {
      const fresh = await api.session(token);
      setPlayerId(fresh.playerId);
      // The user too, not just the player. This used to set only `playerId`,
      // which was fine while claiming a player was the only thing that could
      // change mid-session — and stopped being fine the moment confirming an
      // email had to clear a prompt that reads `user.emailVerifiedAt`.
      if (fresh.user) {
        setUser(fresh.user);
        void persist({ user: fresh.user, playerId: fresh.playerId });
      }
    } catch {
      /* best effort — whatever prompted this already succeeded server-side */
    }
  }, [token]);

  const continueAsGuest = useCallback(async () => {
    await SecureStore.setItemAsync(GUEST_KEY, '1');
    setIsGuest(true);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await adopt(await api.login({ email, password }));
    },
    [adopt],
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      await adopt(await api.signup({ email, password, displayName }));
    },
    [adopt],
  );

  const signOut = useCallback(async () => {
    // Clear locally first, then tell the server. If the request fails the user
    // is still signed out on this device, which is what they asked for; the
    // session row expires on its own.
    const current = token;
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    // The cached profile goes with it — a signed-out launch must not restore
    // the name the credential used to belong to.
    await SecureStore.deleteItemAsync(USER_KEY);
    await SecureStore.deleteItemAsync(GUEST_KEY);
    setToken(null);
    setUser(null);
    setIsGuest(false);
    setPlayerId(null);

    void logOutPurchases();

    if (current) {
      try {
        await api.logout(current);
      } catch {
        /* best effort */
      }
    }
  }, [token]);

  const value = useMemo<SessionState>(
    () => ({
      user,
      token,
      isGuest,
      playerId,
      refreshSession,
      isLoading,
      signIn,
      signUp,
      continueAsGuest,
      signOut,
    }),
    [
      user,
      token,
      isGuest,
      playerId,
      refreshSession,
      isLoading,
      signIn,
      signUp,
      continueAsGuest,
      signOut,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside a <SessionProvider>');
  return context;
}

/**
 * The token, for callers that need to make an authenticated request.
 * Throws if called while signed out — a request without a token is a bug,
 * not something to paper over with an anonymous call.
 */
export function useAuthToken(): string {
  const { token } = useSession();
  if (!token) throw new Error('No session token — this screen should be behind the auth guard');
  return token;
}

export { ApiError };
