/**
 * The few colours that cannot be a className.
 *
 * `placeholderTextColor`, `ActivityIndicator`'s `color`, `Switch`'s
 * `trackColor` and the status bar style are all props that take a colour
 * value, not a class — so they cannot read the palette the way everything else
 * does, and every one of them was a literal hex sitting in a component:
 * `#98989b` here, `#5980a6` there. In light mode that was merely duplication.
 * With a dark theme it is a bug: eight hard-coded light-mode colours that stay
 * light-mode on a near-black screen.
 *
 * These mirror `global.css`, and `theme.test.ts` parses that file and asserts
 * they still agree — because two copies of a palette is exactly the kind of
 * thing that drifts by one step and is never noticed.
 *
 * Deliberately free of any React Native import, so the drift test can load it.
 * `vitest.config.ts` runs over `lib/` with no renderer and no RN resolution on
 * purpose — the hooks that read the device's scheme live in `use-theme.ts`.
 */
export type ThemeColors = {
  /** Placeholder text in a `TextInput`. */
  placeholder: string;
  /** Spinners and the switch's "on" track. */
  primary: string;
  /** Type and glyphs that sit on `primary`. */
  primaryForeground: string;
  /** The switch's "off" track. */
  track: string;
  /** The switch's thumb, in both positions. */
  thumb: string;
  /** Body type, for anything that needs it as a value. */
  foreground: string;
};

const LIGHT: ThemeColors = {
  placeholder: '#98989b', // neutral-500
  primary: '#5980a6',
  primaryForeground: '#f2f2f3',
  track: '#d4d4d7', // neutral-300
  thumb: '#f2f2f3',
  foreground: '#1d1f20',
};

const DARK: ThemeColors = {
  placeholder: '#6e757b', // neutral-500, dark set
  primary: '#749dc4',
  primaryForeground: '#121416',
  track: '#2e3337', // neutral-300, dark set
  thumb: '#e8e9ea',
  foreground: '#e8e9ea',
};

/**
 * Anything that is not explicitly dark gets the light set.
 *
 * The parameter is widened to `string` rather than React Native's
 * `ColorSchemeName` so this file stays free of RN imports — see the note
 * above. RN can also report `'unspecified'`, and the answer for that is the
 * same as for null: paper.
 */
export function themeColors(scheme: string | null | undefined): ThemeColors {
  return scheme === 'dark' ? DARK : LIGHT;
}

/** Which status bar sits on which ground. */
export function statusBarStyle(scheme: string | null | undefined): 'light' | 'dark' {
  return scheme === 'dark' ? 'light' : 'dark';
}

/** Exported for the drift test, not for callers. */
export const THEMES = { light: LIGHT, dark: DARK } as const;
