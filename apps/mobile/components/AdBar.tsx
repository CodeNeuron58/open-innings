/**
 * The banner, and the pitch that lives next to it.
 *
 * Two rules, and the first one is not negotiable:
 *
 *   1. **This never appears on a scorer screen.** The scorer does three hours
 *      of unpaid work with two hundred taps; monetising them is both rude and
 *      bad business, because they are the reason the other twenty-one people
 *      are here. Ads live on the reading surfaces — the card, the over-by-over
 *      feed, the share screens. See the ad strategy in FEATURES.md.
 *
 *   2. **Every unit resolves through `adUnit()`**, which returns Google's test
 *      unit under Metro. Tapping your own live ad terminates an AdMob account
 *      and Google does not reverse it, so a real ID must never be loadable on
 *      a machine a developer is holding.
 *
 * The removal pitch sits inside the ad rather than behind a wall, which is the
 * whole monetisation idea: the ad is the argument for paying to remove it, and
 * nothing else in the app is withheld.
 */
import { Pressable, Text, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { adUnit, type Placement } from '../lib/ads';

export function AdBar({
  placement = 'scorecard_banner',
  onRemove,
}: {
  placement?: Placement;
  /**
   * Opens the supporter purchase.
   *
   * ⚠️ Nothing passes this yet — `react-native-purchases` is not installed and
   * no product is purchasable, so the label renders inert rather than opening
   * a paywall that cannot take money. One prop away from working; see
   * docs/wiring.md.
   */
  onRemove?: () => void;
}) {
  const unitId = adUnit(placement);

  // Nothing safe to show. Render nothing rather than an empty framed strip —
  // a missing few pixels beats a box that looks broken.
  if (!unitId) return null;

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
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Remove ads for ₹99"
        accessibilityState={{ disabled: !onRemove }}
        onPress={onRemove}
        disabled={!onRemove}
        className={`shrink-0 px-1 py-1 ${onRemove ? 'active:opacity-60' : 'opacity-40'}`}
      >
        <Text className="text-steel-700 font-heading text-[9px] uppercase tracking-[1.2px]">
          Remove ₹99
        </Text>
      </Pressable>
    </View>
  );
}
