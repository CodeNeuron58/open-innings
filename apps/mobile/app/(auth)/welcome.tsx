/**
 * A2 — Welcome screen.
 * Pitches the app and offers paths: sign up, browse as guest, or sign in.
 */
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useSession } from '../../lib/session';
import { Button, Card, Kicker } from '../../components/ui';

/** The keypad preview — a still of the one interaction the whole app is. */
function KeypadPreview() {
  const keys = [
    { label: '0', tone: 'bg-background', text: 'text-foreground' },
    { label: '1', tone: 'bg-background', text: 'text-foreground' },
    { label: '4', tone: 'bg-four', text: 'text-four-foreground' },
    { label: 'W', tone: 'bg-wicket', text: 'text-wicket-foreground' },
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
   */
  return (
    <Card>
      <View className="border-border flex-row border-l border-t">
        {keys.map((k) => (
          <View
            key={k.label}
            className={`${k.tone} border-border h-11 flex-1 items-center justify-center border-b border-r`}
          >
            <Text className={`${k.text} font-heading text-[18px]`}>{k.label}</Text>
          </View>
        ))}
      </View>
      <Text className="text-foreground/70 mt-3 text-[13px] leading-5">
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

      <ScrollView contentContainerClassName="px-5 pb-6 pt-6 grow">
        {/* 44 on 38. Condensed caps carry a leading tighter than their own
            size, and the two lines are meant to stack as one block rather
            than read as two. There are no descenders in either word. */}
        <Text className="text-foreground font-heading text-[44px] uppercase leading-[38px]">
          Open{'\n'}Innings
        </Text>
        <View className="mt-2">
          <Kicker>Score every ball</Kicker>
        </View>

        <View className="mt-5">
          <KeypadPreview />
        </View>

        <View className="mt-6 gap-5">
          {POINTS.map((p) => (
            <View key={p.no} className="flex-row gap-3">
              <Text className="text-steel-700 font-heading w-7 shrink-0 text-[13px] tracking-[1.2px]">
                {p.no}
              </Text>
              <View className="flex-1">
                <Text className="text-foreground font-heading text-[17px]">{p.title}</Text>
                <Text className="text-foreground/70 mt-1 text-[14px] leading-5">{p.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Pushes the actions to the bottom on tall screens without stranding
            them off-screen on short ones. */}
        <View className="grow" />

        <View className="mt-6">
          {/*
            A button says what happens when it is pressed.

            This read "Start a match" and opened a signup form. Nothing about
            it was untrue in the long run — an account is genuinely needed
            before a ball can be scored — but the first thing the app did was
            promise one thing and do another, on the screen where somebody is
            deciding whether to trust it.
          */}
          <Button label="Create an account" onPress={() => router.push('/signup')} />

          {/*
            The escape hatch, and the reason this screen is not a wall.

            It used to say "Look around first", which was honest about the
            limitation and vague about the offer, because at the time the offer
            was a box asking for a URL. There is live cricket behind it now, so
            the label can name it.
          */}
          <View className="mt-3">
            <Button
              label="Watch live cricket"
              variant="secondary"
              onPress={async () => {
                await continueAsGuest();
                router.replace('/browse');
              }}
            />
          </View>

          <View className="mt-3 items-center">
            <Text className="text-foreground/60 font-heading text-[11px] uppercase tracking-[1.4px]">
              Already scoring?{' '}
              <Text className="text-steel-700" onPress={() => router.push('/login')}>
                Sign in
              </Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
