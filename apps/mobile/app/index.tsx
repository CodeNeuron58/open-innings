/**
 * Scaffold verification screen.
 *
 * This is not a product screen — it exists to prove three things actually work
 * on a real device before any UI gets built on top of them:
 *
 *   1. `@open-innings/scoring` resolves through the pnpm workspace and its
 *      pure functions execute under Hermes, not just under Node.
 *   2. `@open-innings/shared` resolves too, so Zod validation is available
 *      client-side and the app and server agree on what valid input is.
 *   3. NativeWind is applying the Pavilion tokens.
 *
 * The engine is the reason a rewrite wasn't needed. If it runs here, the hard
 * part of the port is already done. Replace this screen once the scorer lands.
 */
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  applyBall,
  initialState,
  buildScorecard,
  formatOvers,
  asInningsId,
  asPlayerId,
  type MatchState,
} from '@open-innings/scoring';
import { createMatchSchema } from '@open-innings/shared';

const INNINGS_ID = 'innings-demo';
const STRIKER = 'player-striker';
const NON_STRIKER = 'player-non-striker';
const BOWLER = 'player-bowler';

/** Bowl a short over through the real engine — no mocks, no shortcuts. */
function playDemoOver(): MatchState {
  let state = initialState({
    matchId: 'match-demo',
    oversPerInnings: 20,
    teamAId: 'team-a',
    teamBId: 'team-b',
    battingTeamId: 'team-a',
    bowlingTeamId: 'team-b',
    inningsId: INNINGS_ID,
    inningsNumber: 1,
    strikerId: STRIKER,
    nonStrikerId: NON_STRIKER,
    bowlerId: BOWLER,
  });

  const deliveries: Array<{
    eventType: 'dot' | '1' | '4' | '6' | 'wide';
    off: number;
    extra: number;
  }> = [
    { eventType: '4', off: 4, extra: 0 },
    { eventType: '1', off: 1, extra: 0 },
    { eventType: 'wide', off: 0, extra: 1 },
    { eventType: '6', off: 6, extra: 0 },
    { eventType: 'dot', off: 0, extra: 0 },
  ];

  for (const d of deliveries) {
    // The engine rotates the strike itself, so read the pair back off the
    // state each ball rather than tracking it here.
    state = applyBall(state, {
      inningsId: asInningsId(INNINGS_ID),
      eventType: d.eventType,
      runsOffBat: d.off,
      extraRuns: d.extra,
      batsmanId: state.currentInnings.strikerId,
      nonStrikerId: state.currentInnings.nonStrikerId,
      bowlerId: asPlayerId(BOWLER),
    });
  }

  return state;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="border-scoreboard-border flex-row items-center justify-between border-b py-3">
      <Text className="text-scoreboard-muted text-sm">{label}</Text>
      <Text className="text-scoreboard-text text-base font-semibold">{value}</Text>
    </View>
  );
}

export default function Index() {
  let state: MatchState | null = null;
  let engineError: string | null = null;

  try {
    state = playDemoOver();
  } catch (err) {
    engineError = err instanceof Error ? err.message : String(err);
  }

  // Prove the shared schemas run here too — this one should fail, because a
  // toss winner with no decision is exactly what the server rejects.
  const schemaRejects = !createMatchSchema.safeParse({
    oversPerInnings: 20,
    teamAId: 'a',
    teamBId: 'b',
    tossWinnerTeamId: 'b',
    openingStrikerId: 'p1',
    openingNonStrikerId: 'p2',
    openingBowlerId: 'p3',
  }).success;

  const innings = state?.currentInnings;
  const scorecard = state ? buildScorecard(state) : null;

  return (
    <SafeAreaView className="bg-scoreboard flex-1">
      <ScrollView contentContainerClassName="p-5">
        <Text className="text-scoreboard-accent text-xs font-bold uppercase tracking-widest">
          Open Innings
        </Text>
        <Text className="text-scoreboard-text mt-1 text-2xl font-bold">Scaffold check</Text>
        <Text className="text-scoreboard-muted mt-1 text-sm">
          Running the real scoring engine on-device.
        </Text>

        {engineError ? (
          <View className="bg-wicket mt-6 rounded-lg p-4">
            <Text className="text-wicket-foreground font-semibold">Engine failed</Text>
            <Text className="text-wicket-foreground mt-1 text-xs">{engineError}</Text>
          </View>
        ) : (
          <View className="bg-scoreboard-panel border-scoreboard-border mt-6 rounded-xl border p-4">
            <View className="flex-row items-baseline gap-2">
              <Text className="text-scoreboard-text text-4xl font-bold">
                {innings!.runs}-{innings!.wickets}
              </Text>
              <Text className="text-scoreboard-muted text-lg">
                ({formatOvers(innings!.ballsBowled)})
              </Text>
            </View>

            <View className="mt-4">
              <Row label="Extras" value={String(innings!.extras)} />
              <Row label="Legal balls" value={String(innings!.ballsBowled)} />
              <Row label="Batters counted" value={String(scorecard!.batting.length)} />
              <Row label="Shared schema rejects bad toss" value={schemaRejects ? 'yes' : 'NO'} />
            </View>
          </View>
        )}

        <View className="mt-6 flex-row flex-wrap gap-2">
          <Chip label="4" tone="four" />
          <Chip label="6" tone="six" />
          <Chip label="W" tone="wicket" />
          <Chip label="wd" tone="extra" />
        </View>
        <Text className="text-scoreboard-muted mt-3 text-xs">
          If those four chips are blue, purple, red and amber, NativeWind has the Pavilion tokens.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ label, tone }: { label: string; tone: 'four' | 'six' | 'wicket' | 'extra' }) {
  const bg = {
    four: 'bg-four',
    six: 'bg-six',
    wicket: 'bg-wicket',
    extra: 'bg-extra',
  }[tone];

  return (
    <View className={`${bg} h-10 w-10 items-center justify-center rounded-full`}>
      <Text className="text-xs font-bold text-white">{label}</Text>
    </View>
  );
}
