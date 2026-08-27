/**
 * The colour scheme in force, and the palette that goes with it.
 *
 * Separate from `theme.ts` because that file has to stay importable by the
 * drift test, and `vitest.config.ts` runs over `lib/` with no React Native
 * resolution at all — deliberately, as its own note explains.
 */
import { useColorScheme } from 'nativewind';
import { statusBarStyle, themeColors, type ThemeColors } from './theme';

/**
 * The palette for the scheme the app is in.
 *
 * NativeWind's hook, not React Native's. React Native's reports the *device*,
 * which is the wrong answer now that the theme is a setting — somebody with a
 * dark phone who chose Light would have got light screens with a dark status
 * bar and grey-on-grey placeholder text, because the CSS followed the choice
 * and these few values followed the phone.
 *
 * This is the same source `.dark:root` hangs off, so the two cannot disagree.
 * It re-renders on a change, whether that change came from the switch in More
 * or from a phone on `system` reaching sunset.
 */
export function useTheme(): ThemeColors {
  const { colorScheme } = useColorScheme();
  return themeColors(colorScheme ?? null);
}

/** Which status bar sits on the current ground. */
export function useStatusBarStyle(): 'light' | 'dark' {
  const { colorScheme } = useColorScheme();
  return statusBarStyle(colorScheme ?? null);
}
