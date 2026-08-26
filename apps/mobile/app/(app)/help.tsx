/**
 * How to score with this thing.
 *
 * There was no help anywhere, and three of the console's interactions are not
 * discoverable without it: the armed-extra model means two different things
 * depending on which extra is armed, the options behind a long-press are a
 * gesture nothing advertises, and the bowler row is tappable only part-way
 * through an over.
 *
 * Every one of those has been made more obvious in the interface itself, which
 * is the better fix and the one that came first. This is for the rest — the
 * things a screen cannot explain in the space it has, and the law numbers that
 * used to sit on the console interrupting somebody mid-over.
 *
 * Written as answers to questions a scorer actually asks, not as a feature
 * tour. Nobody opens help to find out what the app can do; they open it
 * because something just happened that they did not expect.
 */
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Button, Kicker } from '../../components/ui';

type Entry = { q: string; a: string };

const SCORING: Entry[] = [
  {
    q: 'How do I score a wide with runs off it?',
    a: 'Tap Wide, then tap how many they ran. The key shows what it will put on the board before you tap it — Wide then 4 reads “4 wd”, because the runs off a wide are the whole total.',
  },
  {
    q: 'And a no ball?',
    a: 'Tap No ball, then tap what came off the bat. No ball then 4 reads “5 nb”: four to the batter and one for the no ball. That is the difference between the two, and it is why the keys show the answer.',
  },
  {
    q: 'A stumping off a wide?',
    a: 'Arm Wide, then tap W. The wicket sheet opens already set to Wide, so the penalty run is kept. It works the same for a run out off a no ball.',
  },
  {
    q: 'The wrong batter is on strike.',
    a: 'Tap “Swap the ends” under the batters. Strike is worked out from the runs, which is right almost always — but on a run out where they crossed and nothing was completed there is nothing in the runs to see. Swapping corrects the delivery that decided it.',
  },
  {
    q: 'A batter is going off injured.',
    a: 'Match options, then Retire a batter. It is not a dismissal and it does not use up a ball, so it is deliberately not on the W key.',
  },
  {
    q: 'The bowler cannot finish the over.',
    a: 'Match options, then Replace the bowler. The over carries on from where it is. Only do this if they genuinely cannot continue — a bowler may not bowl two overs in succession, and the app holds them out of the next one either way.',
  },
];

const FIXING: Entry[] = [
  {
    q: 'I tapped the wrong thing.',
    a: 'Undo takes the last delivery off, and it tells you which one it is about to remove. For anything further back, tap the ball in the strip above the keypad.',
  },
  {
    q: 'A ball three overs ago was wrong.',
    a: 'Scroll the strip and tap it. You can change what it was, including turning it into a wicket or taking a wicket away, and everything after it is re-checked. If the change makes a later delivery impossible, nothing is saved and you are told which one.',
  },
  {
    q: 'The last few went in wrongly and I would rather start again.',
    a: 'Tap the first bad one and choose “undo this delivery and everything after”. It counts them and asks once.',
  },
  {
    q: 'Will anyone know I corrected something?',
    a: 'Yes, and deliberately. A corrected delivery carries a small mark. The card is a record of the match, and an edit that left no trace would make it a record of nothing in particular.',
  },
];

const GROUND: Entry[] = [
  {
    q: 'There is no signal at this ground.',
    a: 'Keep scoring. Every ball is saved on the phone first and sent when there is a connection — the bar above the keypad says how many are still waiting. Nothing is lost if the app is closed, and nothing is lost if the battery goes.',
  },
  {
    q: 'What does “3 balls on this phone” mean?',
    a: 'They are recorded and safe, and the server has not confirmed them yet. It clears itself when you have signal. You do not need to do anything.',
  },
  {
    q: 'Can someone else follow along?',
    a: 'Share the match from the result or card screen. Every scorecard is public and needs no account to read — that link is the thing worth sending.',
  },
  {
    q: 'It says somebody else is scoring this match.',
    a: 'The last ball came from another device signed in to your account. Two people scoring the same match will overwrite each other, so agree who is holding the book.',
  },
];

function Answer({ entry }: { entry: Entry }) {
  return (
    <View className="border-border border-b py-3.5">
      <Text className="text-foreground font-heading text-[16px]">{entry.q}</Text>
      <Text className="text-foreground/75 mt-1.5 text-[14px] leading-[20px]">{entry.a}</Text>
    </View>
  );
}

function Section({ title, entries }: { title: string; entries: Entry[] }) {
  return (
    <View className="pt-7">
      <Kicker>{title}</Kicker>
      <View className="border-border mt-1.5 border-t">
        {entries.map((e) => (
          <Answer key={e.q} entry={e} />
        ))}
      </View>
    </View>
  );
}

export default function Help() {
  const router = useRouter();

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <View className="border-border flex-row items-center gap-2 border-b px-5 py-3">
        <Text className="text-foreground font-heading flex-1 text-[19px]">Scoring help</Text>
        <Button label="Done" variant="ghost" onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerClassName="px-5 pb-10">
        <Text className="text-foreground/75 pt-4 text-[14px] leading-[20px]">
          The things the screens cannot say in the space they have.
        </Text>

        <Section title="Scoring" entries={SCORING} />
        <Section title="Fixing a mistake" entries={FIXING} />
        <Section title="At the ground" entries={GROUND} />

        {/*
          The law numbers, in the one place they belong.

          They used to sit on the live console — "Only Run Out & Obstruction
          (Law 21.18)" beside the free hit banner — where a scorer needs to know
          what they can tap rather than which clause governs it.
        */}
        <View className="pt-7">
          <Kicker>The laws behind it</Kicker>
          <Text className="text-foreground/75 mt-2 text-[14px] leading-[20px]">
            The app enforces these rather than trusting the scorer to remember them, which is why a
            delivery is sometimes refused.
          </Text>
          <View className="border-border mt-3 border-t">
            {[
              ['Law 16.2', 'A bowler may not bowl two overs in succession.'],
              ['Law 17.4', 'A bowler may only be replaced mid-over if they cannot continue.'],
              ['Law 21.18', 'On a free hit the striker can only go the ways a no ball allows.'],
              ['Law 22.6', 'Off a wide: stumped, run out, hit wicket or obstruction only.'],
              ['Law 24', 'Byes and leg byes are the side’s runs, never the batter’s.'],
              ['Law 41/42', 'Five penalty runs for a helmet on the field, or a tampered ball.'],
            ].map(([law, text]) => (
              <View key={law} className="border-border flex-row gap-3 border-b py-2.5">
                <Text className="font-heading w-[74px] shrink-0 text-[11px] uppercase tracking-[1.2px] text-neutral-700">
                  {law}
                </Text>
                <Text className="text-foreground/80 min-w-0 flex-1 text-[13.5px] leading-[19px]">
                  {text}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <Text className="text-foreground/65 pt-7 text-[13.5px] leading-[19px]">
          Everything in this app is worked out from the balls you tap, so nothing is entered twice
          and correcting a delivery corrects every figure that came from it.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
