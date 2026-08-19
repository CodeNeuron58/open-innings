/**
 * Session state for the app.
 * Token is stored in expo-secure-store and verified server-side on launch.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { AuthResponse } from '@open-innings/shared';
import { api, ApiError } from './api';

const TOKEN_KEY = 'oi_session_token';

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

        const result = await api.session(stored, controller.signal);
        if (result.user) {
          setToken(stored);
          setUser(result.user);
          setPlayerId(result.playerId);
        } else {
          // Revoked or expired server-side — don't keep a dead credential.
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          setUser(null);
        }
        // Bound but not yet read. Distinguishing "offline" from "server said
        // no" would let this screen say which, instead of treating every
        // failure as a lost connection.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- to distinguish offline from a server refusal
      } catch (error) {
        // Offline or the server is unreachable. Deliberately does NOT clear
        // the token: a scorer at a ground with no signal must not be logged
        // out because the network dropped. They land on the login screen and
        // the token is revalidated next time the app opens with a connection.
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
    // A fresh sign-in does not know yet; the session call fills it in.
    void api
      .session(auth.token)
      .then((s) => setPlayerId(s.playerId))
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
      if (fresh.user) setUser(fresh.user);
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
    await SecureStore.deleteItemAsync(GUEST_KEY);
    setToken(null);
    setUser(null);
    setIsGuest(false);
    setPlayerId(null);

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
