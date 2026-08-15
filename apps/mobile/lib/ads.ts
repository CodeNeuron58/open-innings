/**
 * Ad unit IDs, in one place, so a real one can never reach a dev build.
 *
 * Tapping your own live ad is the single fastest way to get an AdMob account
 * terminated, and Google does not reverse it. The only reliable defence is to
 * never have a real unit ID loaded on a machine a developer is holding — so
 * every ID in the app resolves through `adUnit()`, which hands back Google's
 * public test unit unless this is a release build.
 *
 * `__DEV__` is false in `preview` and `production` EAS builds and true under
 * Metro, which is the line we want: testers on a preview APK see real ads,
 * whoever is running `expo start` never does.
 *
 * The App ID (the `~` one) is separate and lives in app.json — it's compiled
 * into the manifest, is not a secret, and is the same in every build.
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
 * The unit ID to request for a placement.
 *
 * Returns null when there is nothing safe to show — an unconfigured placement
 * in a release build — so callers render nothing rather than an error. An
 * empty slot is a missing few pixels; a wrong slot is a policy strike.
 */
export function adUnit(placement: Placement): string | null {
  if (__DEV__) return TEST_UNITS[placement];
  return LIVE_UNITS[placement] || null;
}
