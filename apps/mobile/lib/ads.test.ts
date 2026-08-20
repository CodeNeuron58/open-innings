/**
 * The ad thesis, enforced instead of remembered.
 *
 * FEATURES.md listed this as "Planned: a test that fails if an ad component
 * ever mounts inside a scorer route. The thesis should be enforced by CI, not
 * by memory." It stayed planned, and in the meantime the thesis drifted: the
 * comment in `ads.ts` claimed every placement was a viewer surface while
 * `AdBar` sat on three screens a scorer reaches the moment a match ends.
 *
 * There is no React renderer here on purpose — see vitest.config.ts. These are
 * source-level assertions, which is enough for the two rules that matter and
 * costs nothing to run.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * `ads.ts` imports the AdMob native module for its `TestIds`. Nothing native
 * loads under a node runner, so it is stubbed — with the same shape and
 * obviously-fake values, so a live id leaking through the assertions below
 * cannot be mistaken for a test id.
 */
vi.mock('react-native-google-mobile-ads', () => ({
  TestIds: { BANNER: 'test-banner', NATIVE: 'test-native' },
}));

/*
 * `__DEV__` is a React Native global that no node runner defines. Setting it
 * true here is not a convenience — it is the case that matters: a live unit
 * loading on a developer's machine is what gets an AdMob account terminated
 * for invalid traffic, and it is the scenario `adUnit` exists to prevent.
 */
(globalThis as { __DEV__?: boolean }).__DEV__ = true;

const { adUnit } = await import('./ads');

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(resolve(APP, p), 'utf8');

/**
 * The scoring console and everything it mounts.
 *
 * Not the card or share screens: those are public, a viewer reaches them too,
 * and the scorer is excused there by `owned` rather than by route. Route is
 * the right tool only where the surface is scorer-only, which is these.
 */
const SCORER_SOURCES = [
  'app/(app)/matches/[id]/score.tsx',
  'components/scorer/BallChip.tsx',
  'components/scorer/CorrectBall.tsx',
  'components/scorer/EndOfOver.tsx',
  'components/scorer/InningsBreak.tsx',
  'components/scorer/Sheets.tsx',
];

describe('the scorer never sees an ad', () => {
  it.each(SCORER_SOURCES)('%s mounts no ad component', (file) => {
    const source = read(file);
    expect(source).not.toMatch(/\bAdBar\b/);
    expect(source).not.toMatch(/\bBannerAd\b/);
    expect(source).not.toMatch(/react-native-google-mobile-ads/);
  });

  it('AdBar takes an `owned` escape hatch, because route alone is not enough', () => {
    // The card and share screens are public and cannot be decided by route.
    // If this prop is ever removed, the scorer starts seeing ads on the three
    // screens they land on when a match ends, and nothing else would say so.
    const source = read('components/AdBar.tsx');
    expect(source).toMatch(/owned/);
    expect(source).toMatch(/if \(owned\) return null;/);
  });

  it.each(['card', 'cards', 'share'])('%s.tsx passes ownership through to AdBar', (screen) => {
    const source = read(`app/(app)/matches/[id]/${screen}.tsx`);
    expect(source).toMatch(/<AdBar[^>]*owned=/);
  });
});

describe('adUnit', () => {
  it('serves a test unit on a developer machine, never a live one', () => {
    for (const placement of ['scorecard_banner', 'match_list_native'] as const) {
      expect(adUnit(placement)).not.toMatch(/^ca-app-pub-/);
    }
  });

  it('resolves every declared placement to something renderable', () => {
    // A null here renders nothing, which is a silently missing ad rather than
    // a visible fault — worth asserting because it would not look broken.
    expect(adUnit('scorecard_banner')).toBeTruthy();
    expect(adUnit('match_list_native')).toBeTruthy();
  });

  it('gates live units behind BOTH a release build and an explicit opt-in', () => {
    // Two conditions, deliberately: `expo start` against a production profile
    // would otherwise be enough to load real ads.
    const source = read('lib/ads.ts');
    expect(source).toMatch(/if \(__DEV__ \|\| !LIVE_ADS_ENABLED\) return TEST_UNITS\[placement\];/);
    expect(source).toMatch(/EXPO_PUBLIC_ADS_MODE === 'live'/);
  });
});
