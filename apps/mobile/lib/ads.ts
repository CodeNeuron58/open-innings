/**
 * Ad unit IDs. Always resolve through adUnit() to avoid using live
 * ads during development and risking AdMob account termination.
 */
import { TestIds } from 'react-native-google-mobile-ads';

/**
 * Real unit IDs from the AdMob console. Format: `ca-app-pub-<pub>/<unit>`.
 *
 * Placement names mirror FEATURES.md so AdMob reporting and the codebase agree
 * on what a number refers to.
 *
 * ## The thesis, and how it is actually enforced
 *
 * The person who did the scoring never sees an ad. That is the product, not a
 * nicety — three hours and 240 taps is the toll, and charging attention on top
 * of it is how a scorer stops opening the app.
 *
 * This comment used to claim every placement below was a "viewer surface", and
 * that was only half true. No ad has ever appeared on the scoring console,
 * which is the easy half. But the card and share screens carried one, and
 * those are precisely where a scorer lands when the match ends — so the person
 * the promise is about was the one seeing it.
 *
 * Those screens are public, so the route cannot decide it. `AdBar` now takes
 * `owned`, fed by `isMine` on the card and summary responses, and renders
 * nothing when the viewer is the scorer. Route alone is not sufficient and was
 * never going to be.
 */
const LIVE_UNITS = {
  /** Banner under a public scorecard. Live: `AdBar`, on card/cards/share. */
  scorecard_banner: 'ca-app-pub-8954748975838698/3171143107',
  /**
   * Native ad in the match browse list.
   *
   * ⚠️ **Provisioned in AdMob, not placed in the app.** Nothing renders it.
   * Kept rather than deleted because the unit exists in the console and
   * deleting the constant would not delete it there — but do not read this
   * list as a description of what ships.
   */
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
