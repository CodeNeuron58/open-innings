/**
 * Device settings.
 *
 * Per-device, not per-account: "keep the screen on while I score" is a
 * property of the phone in someone's hand, not of who is signed in. A scorer
 * borrowing a club phone should not inherit the owner's preferences, and
 * syncing them would mean a settings table and a round trip to answer a
 * question the device can answer instantly.
 *
 * Stored in **expo-secure-store**, which is a slightly odd home for a boolean
 * — it is the Android Keystore, meant for credentials. The alternative was
 * adding AsyncStorage, and a whole extra native module to persist two booleans
 * is the worse trade. The values are tiny and the store is already here for
 * the session token. If settings ever grow past a handful, move them.
 *
 * Defaults are applied optimistically so the first render is correct: waiting
 * on disk to decide whether to keep the screen awake would let it sleep during
 * the read.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const STORE_KEY = 'oi_settings_v1';

export type Settings = {
  /**
   * Hold the screen on while a match is being scored.
   *
   * On by default, and the reason this module exists. A three-hour match on a
   * phone that sleeps every thirty seconds means unlocking it between every
   * delivery — which is the difference between an app someone scores a season
   * with and one they abandon after a game.
   */
  keepAwakeWhileScoring: boolean;
};

const DEFAULTS: Settings = {
  keepAwakeWhileScoring: true,
};

type SettingsState = Settings & {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  /** False until the stored values have been read. Defaults apply meanwhile. */
  isLoaded: boolean;
};

const SettingsContext = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    SecureStore.getItemAsync(STORE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          // Merged over the defaults rather than replacing them, so a setting
          // added in a later version has a value for someone upgrading.
          setSettings({ ...DEFAULTS, ...(parsed as Partial<Settings>) });
        }
      })
      .catch(() => {
        // Unreadable or corrupt: fall back to defaults rather than failing to
        // start. Losing a preference is not worth a broken launch.
      })
      .finally(() => {
        if (!cancelled) setIsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      // Applied immediately and written in the background — a toggle that
      // waits on disk before moving feels broken.
      void SecureStore.setItemAsync(STORE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ...settings, set, isLoaded }), [settings, set, isLoaded]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsState {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider');
  return context;
}
