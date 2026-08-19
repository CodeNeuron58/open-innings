/**
 * Device settings stored locally (expo-secure-store).
 * Applies defaults optimistically for immediate first render.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const STORE_KEY = 'oi_settings_v1';

export type Settings = {
  /** Hold the screen on while a match is being scored. */
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
