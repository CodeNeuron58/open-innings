/**
 * Session state for the app.
 *
 * The token goes in expo-secure-store, which is backed by the Android Keystore
 * — not AsyncStorage, which is plain unencrypted files any rooted device or
 * backup extraction can read. It's a 30-day credential to someone's scoring
 * account; it belongs in the keystore.
 *
 * On launch the stored token is verified against `/api/auth/session` rather
 * than trusted. A token can be revoked server-side (sign-out on another
 * device, expiry, account deletion), and the only way to know is to ask.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { AuthResponse } from '@open-innings/shared';
import { api, ApiError } from './api';

const TOKEN_KEY = 'oi_session_token';

type User = AuthResponse['user'];

type SessionState = {
  /** null once we know nobody is signed in; undefined while still checking. */
  user: User | null | undefined;
  token: string | null;
  /** True until the stored token has been checked against the server. */
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore on launch.
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!stored) {
          setUser(null);
          return;
        }

        const result = await api.session(stored, controller.signal);
        if (result.user) {
          setToken(stored);
          setUser(result.user);
        } else {
          // Revoked or expired server-side — don't keep a dead credential.
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          setUser(null);
        }
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
    setToken(auth.token);
    setUser(auth.user);
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
    setToken(null);
    setUser(null);

    if (current) {
      try {
        await api.logout(current);
      } catch {
        /* best effort */
      }
    }
  }, [token]);

  const value = useMemo<SessionState>(
    () => ({ user, token, isLoading, signIn, signUp, signOut }),
    [user, token, isLoading, signIn, signUp, signOut],
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
