/**
 * Ad unit IDs. Always resolve through adUnit() to avoid using live
 * ads during development and risking AdMob account termination.
 */
import { TestIds } from 'react-native-google-mobile-ads';

/**
 * Real unit IDs from the AdMob console. Format: `ca-app-pub-<pub>/<unit>`.
 *
 * Placement names mirror TODO.md so AdMob reporting and the codebase agree on
 * what a number refers to. Every one of these is a *viewer* surface: the
 * scorer does the work and never sees an ad. See TODO.md, "The thesis".
 */
const LIVE_UNITS = {
  /** Banner under a public scorecard. */
  scorecard_banner: 'ca-app-pub-8954748975838698/3171143107',
  /** Native ad in the match browse list. */
  match_list_native: 'ca-app-pub-8954748975838698/8231898090',
} as const;

export type Placement = keyof typeof LIVE_UNITS;

/** Which Google test unit stands in for each placement during development. */
const TEST_UNITS: Record<Placement, string> = {
  scorecard_banner: TestIds.BANNER,
  match_list_native: TestIds.NATIVE,
};

/**
 * Returns the unit ID for a placement, or null if none is safe to show.
 * Live ads are opt-in via EXPO_PUBLIC_ADS_MODE=live to protect the account.
 */
const LIVE_ADS_ENABLED = process.env.EXPO_PUBLIC_ADS_MODE === 'live';

export function adUnit(placement: Placement): string | null {
  if (__DEV__ || !LIVE_ADS_ENABLED) return TEST_UNITS[placement];
  return LIVE_UNITS[placement] || null;
}
