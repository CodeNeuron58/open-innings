/**
 * F2 — remove ads.
 * Ad-free subscription screen. All other features remain free (AGPL-3.0).
 */
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useSupporter } from '../../lib/purchases';
import { Button, ErrorBanner, Kicker } from '../../components/ui';

const REPO = 'https://github.com/CodeNeuron58/open-innings';

/** What money does not buy, because it never has to. */
const FREE_FOREVER = [
  'Ball-by-ball scoring in every format, with no ad on the console',
  'Public career page, club page and live match links',
  'Unlimited matches, players and clubs',
  'Full export of your scorebook, any time',
];

export default function Supporter() {
  const router = useRouter();
  const { isSupporter, priceString, isLoading, unavailable, purchase, restore } = useSupporter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setMessage(null);
    const result = await purchase();
    setBusy(false);
    if (result.message) setMessage(result.message);
  }

  async function restorePurchase() {
    setBusy(true);
    setMessage(null);
    const result = await restore();
    setBusy(false);
    setMessage(result.message);
  }

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-row items-center gap-2 px-3 pb-2 pt-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-9 w-8 items-center justify-center active:opacity-60"
        >
          <Text className="text-foreground/70 text-xl">‹</Text>
        </Pressable>
        <Text className="text-foreground font-heading min-w-0 flex-1 text-[21px]">Remove ads</Text>
      </View>

      <ScrollView contentContainerClassName="px-4 pb-6">
        {/* The plate. One price, one sentence about what it does. */}
        <View className="bg-scoreboard px-4 py-4">
          <Text className="text-scoreboard-muted font-heading text-[9.5px] uppercase tracking-[1.5px]">
            Open Innings Pro
          </Text>

          {/*
            The store's price, or no price at all.

            This read `priceString ?? '₹99'`, two lines under a comment in
            `purchases.ts` saying never to hardcode one. The fallback is not a
            harmless default: while RevenueCat is unconfigured, `priceString`
            is always null, so ₹99 is the *only* figure anyone sees — and if
            the product created in Play Console is priced differently, the app
            has quietly advertised a price that does not exist.

            A dash is worse to look at and cannot be wrong. The sentence under
            `unavailable` already explains why there is no number.
          */}
          <View className="mt-2 flex-row items-baseline gap-2">
            <Text className="text-scoreboard-text font-heading shrink-0 text-[42px] leading-[42px]">
              {priceString ?? '—'}
            </Text>
            <Text className="text-scoreboard-muted font-heading shrink-0 text-[10px] uppercase tracking-[1.4px]">
              {priceString ? 'per month' : 'price from the store'}
            </Text>
          </View>

          <Text className="text-scoreboard-text/85 mt-3 text-[13px] leading-[19px]">
            No ads on any screen, on every device you sign in on. Cancel any time. Everything
            else stays free and open source, forever.
          </Text>
        </View>

        {isSupporter ? (
          <View className="border-border mt-4 border p-4">
            <Kicker>You&rsquo;re a supporter</Kicker>
            <Text className="text-foreground/75 mt-2 text-[13.5px] leading-5">
              Ads are off across the app. Thank you — this is what pays the server bill.
            </Text>
          </View>
        ) : (
          <>
            <View className="mt-4">
              <Button
                label="Go ad-free"
                loading={busy || isLoading}
                // Nothing is purchasable until RevenueCat has products from
                // Play Console. Better a visibly unavailable button than one
                // that appears to take money and cannot.
                disabled={unavailable !== null}
                onPress={() => void buy()}
              />
            </View>

            {unavailable ? (
              <Text className="text-foreground/55 mt-2 text-center text-[11.5px] leading-4">
                {unavailable} Everything below stays free either way.
              </Text>
            ) : null}
            {/*
              An annual plan was advertised here — "₹899 a year works out at
              ₹75 a month" — and no such thing is purchasable. `useSupporter`
              reads `availablePackages[0]` and nothing else, so there is one
              product and the second price was a claim the app could not honour
              if anyone tapped through expecting it.

              Removed rather than fixed, because fixing it means creating a
              second product in Play Console and building a real selector, and
              a plan that does not exist should not be advertised in the
              meantime. Put it back with the selector, not before.
            */}
          </>
        )}

        {message ? (
          <View className="mt-3">
            <ErrorBanner message={message} />
          </View>
        ) : null}

        <View className="pt-7">
          <Kicker>Free, and staying free</Kicker>
          <View className="mt-2.5">
            {FREE_FOREVER.map((line) => (
              <View key={line} className="flex-row items-start gap-2.5 py-2">
                <Text className="text-steel-700 font-heading shrink-0 text-[13px]">✓</Text>
                <Text className="text-foreground min-w-0 flex-1 text-[13.5px] leading-[19px]">
                  {line}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* The part most paywalls would leave out. */}
        <View className="border-border mt-5 border p-4">
          <Text className="text-foreground font-heading text-[14px]">Or run your own copy</Text>
          <Text className="text-foreground/65 mt-1.5 text-[12.5px] leading-[18px]">
            The whole app is open source under AGPL-3.0. A club can self-host it, ad-free, and pay
            nothing.
          </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open the source on GitHub"
            onPress={() => void Linking.openURL(REPO)}
            className="mt-2.5 active:opacity-60"
          >
            <Text className="text-steel-700 font-heading text-[10px] uppercase tracking-[1.3px]">
              Source on GitHub →
            </Text>
          </Pressable>
        </View>

        {/* Required by both stores, and genuinely needed by anyone who has
            changed phone since paying. */}
        {!isSupporter ? (
          <View className="mt-4">
            <Button
              label="Restore purchase"
              variant="ghost"
              onPress={() => void restorePurchase()}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
