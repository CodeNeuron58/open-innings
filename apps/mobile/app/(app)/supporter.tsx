/**
 * F2 — remove ads.
 * Ad-free subscription screen. All other features remain free (AGPL-3.0).
 */
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useSupporter, type SupporterPlan } from '../../lib/purchases';
import { Button, ErrorBanner, Kicker } from '../../components/ui';

const REPO = 'https://github.com/CodeNeuron58/open-innings';

/** What money does not buy, because it never has to. */
const FREE_FOREVER = [
  'Ball-by-ball scoring in every format, with no ad on the console',
  'Public career page, club page and live match links',
  'Unlimited matches, players and clubs',
  'Full export of your scorebook, any time',
];

const TERM_LABEL: Record<SupporterPlan['term'], string> = {
  annual: 'a year',
  monthly: 'a month',
  other: '',
};

export default function Supporter() {
  const router = useRouter();
  const { isSupporter, plans, isLoading, unavailable, purchase, restore } = useSupporter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);

  /*
   * Yearly is preselected because it is the one worth having, and `plans` is
   * ordered best-value-first by the provider. Selection is stored by id rather
   * than by index so it survives the offering changing underneath us.
   */
  const selected = plans.find((p) => p.id === chosenId) ?? plans[0] ?? null;

  async function buy() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    const result = await purchase(selected);
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
        {/* The plate. What it is, and what it is not. */}
        <View className="bg-scoreboard px-4 py-4">
          <Text className="text-scoreboard-muted font-heading text-[9.5px] uppercase tracking-[1.5px]">
            {/*
              "Open Innings Pro" until 2026-08-20. Pro promises a tier with
              more in it, and there isn't one — every feature is free and
              stays free. What this buys is quiet, and the honest word for
              somebody who pays for a free thing is supporter.
            */}
            Supporter
          </Text>

          <Text className="text-scoreboard-text font-heading mt-2 text-[26px] leading-[30px]">
            Ads off, everywhere
          </Text>

          <Text className="text-scoreboard-text/85 mt-2.5 text-[13px] leading-[19px]">
            On every device you sign in on. Cancel any time. Everything else stays free and open
            source, forever.
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
            {/*
              One row per plan, priced by the store.

              This used to be a single hardcoded figure, and before that a
              second price for an annual plan that did not exist. Every number
              here comes from `product.priceString`, so it is whatever Play
              actually charges in whatever currency the reader is in — there
              is nothing to keep in sync and nothing that can be wrong.
            */}
            <View className="mt-4">
              {plans.map((plan) => {
                const active = selected?.id === plan.id;
                return (
                  <Pressable
                    key={plan.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${plan.priceString} ${TERM_LABEL[plan.term]}`}
                    onPress={() => setChosenId(plan.id)}
                    className={`mb-2 flex-row items-center gap-3 border p-3.5 active:opacity-70 ${
                      active ? 'border-steel-700 bg-steel-100' : 'border-border'
                    }`}
                  >
                    <View
                      className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                        active ? 'border-steel-700 bg-steel-700' : 'border-input'
                      }`}
                    />
                    <View className="min-w-0 flex-1">
                      <Text className="text-foreground font-heading text-[16px]">
                        {plan.priceString}
                        {TERM_LABEL[plan.term] ? (
                          <Text className="text-foreground/60 text-[13px]">
                            {' '}
                            {TERM_LABEL[plan.term]}
                          </Text>
                        ) : null}
                      </Text>
                      {plan.term === 'annual' ? (
                        <Text className="text-foreground/60 mt-0.5 text-[12px]">
                          Billed once a year
                        </Text>
                      ) : null}
                    </View>
                    {plan.savingPercent !== null ? (
                      <Text className="text-steel-800 font-heading shrink-0 text-[10px] uppercase tracking-[1.2px]">
                        Save {plan.savingPercent}%
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <View className="mt-2">
              <Button
                label="Go ad-free"
                loading={busy || isLoading}
                // Nothing is purchasable until RevenueCat has a current
                // offering with packages in it. Better a visibly unavailable
                // button than one that appears to take money and cannot.
                disabled={selected === null}
                onPress={() => void buy()}
              />
            </View>

            {unavailable ? (
              <Text className="text-foreground/55 mt-2 text-center text-[11.5px] leading-4">
                {unavailable} Everything below stays free either way.
              </Text>
            ) : null}
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

        {/*
          No lifetime plan, and saying why is worth more than selling one.

          A lifetime is a promise against a runway, and this one runs on a
          student discount that expires. The longest plan is a year because a
          year is what can honestly be promised — and the thing a lifetime was
          for already exists, one paragraph down, for nothing.
        */}
        <View className="border-border mt-5 border p-4">
          <Text className="text-foreground font-heading text-[14px]">
            Why there&rsquo;s no lifetime plan
          </Text>
          <Text className="text-foreground/65 mt-1.5 text-[12.5px] leading-[18px]">
            We won&rsquo;t sell a lifetime we can&rsquo;t promise. The longest plan is a year. And
            the whole app is open source under AGPL-3.0 — if we ever stop, a club can self-host it,
            ad-free, and pay nothing.
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
