/**
 * The banner ad and removal pitch.
 * Never appears on the scorer screen. Resolves through adUnit().
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useRouter } from 'expo-router';
import { adUnit, type Placement } from '../lib/ads';
import { useSupporter } from '../lib/purchases';

export function AdBar({
  placement = 'scorecard_banner',
  /**
   * True when the person looking at this scored the match.
   *
   * The thesis, stated in `lib/ads.ts` and in FEATURES.md's placement map as
   * "any scorer screen: none, ever", was only half implemented: no ad ever
   * appeared on the scoring console, which is the easy half. But the card and
   * share screens carried one, and those are exactly where a scorer lands
   * after three hours and 240 taps — so the person the promise is about was
   * the one seeing the ad, at the worst possible moment.
   *
   * The screens themselves are public, so this cannot be decided by which
   * route it is. It has to be decided by who is asking, which is why the card
   * and summary responses now carry `isMine`.
   */
  owned = false,
}: {
  placement?: Placement;
  owned?: boolean;
}) {
  const router = useRouter();
  const { isSupporter, isLoading } = useSupporter();
  const [adFailed, setAdFailed] = useState(false);
  const unitId = adUnit(placement);

  // They did the work. No ad, no pitch, regardless of anything below.
  if (owned) return null;

  // Paid for. This is the entire product, so it has to be the first check.
  if (isSupporter) return null;

  // Still asking the store. Showing an ad and then pulling it out from under
  // someone who has already paid is worse than a moment of nothing.
  if (isLoading) return null;

  // Nothing safe to show. Render nothing rather than an empty framed strip —
  // a missing few pixels beats a box that looks broken.
  if (!unitId || adFailed) return null;

  return (
    <View className="border-border flex-row items-center gap-2 border-t px-3 py-1.5">
      <Text className="font-heading shrink-0 text-[8px] uppercase tracking-[1.2px] text-neutral-500">
        Ad
      </Text>

      <View className="min-w-0 flex-1 items-center">
        <BannerAd
          unitId={unitId}
          size={BannerAdSize.BANNER}
          requestOptions={{
            // The scorecard is a public page a child could be looking at, and
            // an over-restrictive request is a smaller problem than the
            // alternative.
            requestNonPersonalizedAdsOnly: true,
          }}
          onAdFailedToLoad={() => setAdFailed(true)}
        />
      </View>

      {/*
        No price here.

        This said "Remove ₹99" in the label and the accessibility name, which
        is a figure the store owns and this component has no way to read. If
        the Play Console product is priced differently — or regionally, which
        it will be — the pitch is wrong everywhere it appears, and it appears
        on three screens. The supporter screen shows the real localised price
        one tap away, from the store itself.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Remove ads"
        onPress={() => router.push('/supporter')}
        className="shrink-0 px-1 py-1 active:opacity-60"
      >
        <Text className="text-steel-700 font-heading text-[9px] uppercase tracking-[1.2px]">
          Remove
        </Text>
      </Pressable>
    </View>
  );
}
