/**
 * A2 — Welcome screen.
 * Pitches the app and offers paths: sign up, browse as guest, or sign in.
 *
 * Measured against `new-design/screens/A2-What-It-Does.html`, which is the
 * drawing this screen is of. Two deliberate departures from it:
 *
 *   The design has one button, "Start a match", opening a signup form. There
 *   are two here, and the primary says what it does — see the notes on each.
 *   The rule between them is A3's, which is the frame this canvas already
 *   draws around an account action and a way in without one.
 *
 *   The design sets the kicker at 10px and the sign-in line at 9px, and A3
 *   sets its "or" at 9px as well. All three stay at 11px, which is the floor
 *   the type pass established across the app and the reason nine 9px labels
 *   were raised in the first place. Everything else on this screen — the
 *   scale, the spacing, the frame — is the drawing's.
 */
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useSession } from '../../lib/session';
import { Button, Card, Kicker } from '../../components/ui';

/** The keypad preview — a still of the one interaction the whole app is. */
function KeypadPreview() {
  const keys = [
    { label: '0', tone: 'bg-background', text: 'text-foreground', size: 'text-[19px]' },
    { label: '1', tone: 'bg-background', text: 'text-foreground', size: 'text-[19px]' },
    { label: '4', tone: 'bg-four', text: 'text-four-foreground', size: 'text-[19px]' },
    // 17px, not 19. A letter at the figures' size out-weighs them, and this
    // one is the darkest cell on the board already.
    { label: 'W', tone: 'bg-wicket', text: 'text-wicket-foreground', size: 'text-[17px]' },
  ];

  /*
   * `Card`, not a hand-drawn box.
   *
   * This was `border-border relative border p-4` — byte-for-byte a `Card`
   * apart from the padding, and missing the one thing `Card` adds: the
   * registration marks at its corners. The leftover `relative` is the
   * fingerprint, since nothing inside was ever positioned against it.
   *
   * In this system a card is a line drawing rather than a surface, so those
   * marks are most of what makes it read as a drawn object. Without them the
   * frame is just a rectangle, which is exactly how it looked.
   *
   * The `neutral-100` fill is the drawing's, and is the one place this screen
   * departs from the readme's "cards are transparent line drawings". It is a
   * three-value lift off the page ground, and its whole job is to let the
   * keys — which sit at the page ground — read as cut out of the card.
   */
  return (
    <Card className="bg-neutral-100 p-4">
      <View className="border-border flex-row border-l border-t">
        {keys.map((k) => (
          <View
            key={k.label}
            className={`${k.tone} border-border h-11 flex-1 items-center justify-center border-b border-r`}
          >
            <Text className={`${k.text} ${k.size} font-heading`}>{k.label}</Text>
          </View>
        ))}
      </View>
      <Text className="mt-2.5 font-sans text-[12.5px] leading-[19px] text-neutral-700">
        One thumb, one tap per ball. Everything else is calculated.
      </Text>
    </Card>
  );
}

const POINTS = [
  {
    no: '01',
    title: 'Any format',
    body: 'T20, ODI, Tests, the Hundred, box and gully rules. Set it once at the toss.',
  },
  {
    no: '02',
    title: 'Everyone follows live',
    body: 'One link. Parents, players and the coach see the same over as you score it.',
  },
  {
    no: '03',
    title: 'Free to the scorer',
    body: 'No ad on the scoring screen, ever. Your scorebook is yours to export.',
  },
] as const;

export default function Welcome() {
  const router = useRouter();
  const { continueAsGuest } = useSession();

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      {/*
        Two blocks, not one scroll with a spacer in it: the drawing is a
        `flex:1` body over a `flex:none` footer, and they carry different
        padding — 34/26/0 against 20/26/22. `grow` on the container and on the
        body is what pins the actions to the bottom of a tall screen while
        still letting a short one scroll them into reach.
      */}
      <ScrollView contentContainerClassName="grow">
        <View className="grow px-[26px] pt-[34px]">
          {/* 40 on 39. Condensed caps carry a leading tighter than their own
              size, and the two lines are meant to stack as one block rather
              than read as two. There are no descenders in either word. */}
          <Text className="text-foreground font-heading text-[40px] uppercase leading-[39px] tracking-[-1px]">
            Open{'\n'}Innings
          </Text>
          <View className="mt-2">
            <Kicker>Score every ball</Kicker>
          </View>

          <View className="mt-[34px]">
            <KeypadPreview />
          </View>

          <View className="mt-[30px] gap-5">
            {POINTS.map((p) => (
              <View key={p.no} className="flex-row gap-3">
                <Text className="text-steel-700 font-heading w-[22px] shrink-0 text-[15px]">
                  {p.no}
                </Text>
                <View className="flex-1">
                  <Text className="text-foreground font-heading text-[17px] leading-[20px]">
                    {p.title}
                  </Text>
                  <Text className="mt-0.5 font-sans text-[13px] leading-[19px] text-neutral-700">
                    {p.body}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View className="px-[26px] pb-[22px] pt-5">
          {/*
            A button says what happens when it is pressed.

            The drawing reads "Start a match" and opens a signup form. Nothing
            about that is untrue in the long run — an account is genuinely
            needed before a ball can be scored — but the first thing the app
            would do is promise one thing and do another, on the screen where
            somebody is deciding whether to trust it.
          */}
          <Button label="Create an account" onPress={() => router.push('/signup')} />

          {/*
            The escape hatch, and the reason this screen is not a wall. It is
            the second button the drawing does not have.

            It used to say "Look around first", which was honest about the
            limitation and vague about the offer, because at the time the offer
            was a box asking for a URL. There is live cricket behind it now, so
            the label can name it.

            The rule is what keeps it from reading as step two. Two full-width
            bars stacked twelve apart are a sequence — do this, then that — and
            these are alternatives: an account, or no account. A3 carries the
            same pair and settles it with exactly this rule at exactly this
            spacing, so it is borrowed rather than invented. Sixteen above and
            below is A3's measure, not a new one.
          */}
          <View className="my-4 flex-row items-center gap-3">
            <View className="bg-border h-px flex-1" />
            <Text className="font-heading text-[11px] uppercase tracking-[1.5px] text-neutral-600">
              or
            </Text>
            <View className="bg-border h-px flex-1" />
          </View>

          <Button
            label="Watch live cricket"
            variant="secondary"
            onPress={async () => {
              await continueAsGuest();
              router.replace('/browse');
            }}
          />

          <View className="mt-3 flex-row items-center justify-center gap-1.5">
            <Text className="font-heading text-[11px] uppercase tracking-[1.5px] text-neutral-600">
              Already scoring?
            </Text>
            {/*
              A `Pressable` rather than an `onPress` on the word, which is what
              this was. Nine characters of 11px type is a target about 44pt
              wide and 13 tall, and the hit slop is the half that was missing.
            */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              hitSlop={12}
              onPress={() => router.push('/login')}
            >
              <Text className="text-steel-700 font-heading text-[11px] uppercase tracking-[1.5px]">
                Sign in
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
