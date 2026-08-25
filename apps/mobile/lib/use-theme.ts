/**
 * The device's colour scheme, and the palette that goes with it.
 *
 * Separate from `theme.ts` because that file has to stay importable by the
 * drift test, and `vitest.config.ts` runs over `lib/` with no React Native
 * resolution at all — deliberately, as its own note explains.
 */
import { useColorScheme } from 'react-native';
import { statusBarStyle, themeColors, type ThemeColors } from './theme';

/**
 * The palette for the scheme the device is in.
 *
 * `useColorScheme` re-renders on a change, so a phone that flips to dark at
 * sunset takes these with it rather than keeping whichever set was resolved
 * when the screen first mounted.
 */
export function useTheme(): ThemeColors {
  return themeColors(useColorScheme());
}

/** Which status bar sits on the current ground. */
export function useStatusBarStyle(): 'light' | 'dark' {
  return statusBarStyle(useColorScheme());
}
