/**
 * Device settings stored locally (expo-secure-store).
 * Applies defaults optimistically for immediate first render.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { colorScheme } from 'nativewind';

const STORE_KEY = 'oi_settings_v1';

/**
 * What the app looks like, and who decides.
 *
 * `system` is offered but is not the default. A scorebook is a light thing —
 * paper, ruled lines, pencil — and that is what somebody should meet the first
 * time they open it, whatever their phone happens to be set to at sunset.
 * Anyone who wants otherwise says so once, in More, and it sticks.
 */
export type ThemeChoice = 'light' | 'dark' | 'system';

export const THEME_CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export type Settings = {
  /** Hold the screen on while a match is being scored. */
  keepAwakeWhileScoring: boolean;
  /** Light, dark, or follow the phone. */
  theme: ThemeChoice;
};

const DEFAULTS: Settings = {
  keepAwakeWhileScoring: true,
  theme: 'light',
};

/**
 * Push the choice into NativeWind, which owns the `dark` class the palette in
 * `global.css` hangs off.
 *
 * Called on load and on every change rather than in a render, because it
 * mutates state outside React and doing that during a render is how you get a
 * warning and a frame of the wrong colours.
 */
function applyTheme(choice: ThemeChoice): void {
  colorScheme.set(choice);
}

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

    // Before the stored value is read, so the first frame is the default and
    // not whatever the device happens to be. NativeWind starts on `system`.
    applyTheme(DEFAULTS.theme);

    SecureStore.getItemAsync(STORE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          // Merged over the defaults rather than replacing them, so a setting
          // added in a later version has a value for someone upgrading.
          const merged = { ...DEFAULTS, ...(parsed as Partial<Settings>) };
          setSettings(merged);
          applyTheme(merged.theme);
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
      if (key === 'theme') applyTheme(next.theme);
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
