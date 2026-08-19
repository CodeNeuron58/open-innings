/**
 * The banner ad and removal pitch.
 * Never appears on the scorer screen. Resolves through adUnit().
 */
import { Pressable, Text, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useRouter } from 'expo-router';
import { adUnit, type Placement } from '../lib/ads';
import { useSupporter } from '../lib/purchases';

export function AdBar({ placement = 'scorecard_banner' }: { placement?: Placement }) {
  const router = useRouter();
  const { isSupporter, isLoading } = useSupporter();
  const unitId = adUnit(placement);

  // Paid for. This is the entire product, so it has to be the first check.
  if (isSupporter) return null;

  // Still asking the store. Showing an ad and then pulling it out from under
  // someone who has already paid is worse than a moment of nothing.
  if (isLoading) return null;

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
        onPress={() => router.push('/supporter')}
        className="shrink-0 px-1 py-1 active:opacity-60"
      >
        <Text className="text-steel-700 font-heading text-[9px] uppercase tracking-[1.2px]">
          Remove ₹99
        </Text>
      </Pressable>
    </View>
  );
}
