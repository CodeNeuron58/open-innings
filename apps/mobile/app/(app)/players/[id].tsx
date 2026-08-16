/**
 * A player's career record.
 *
 * The mobile twin of /p/[playerId] on the web. Same numbers, same source —
 * both read `GET /api/players/[id]/stats`, which computes everything from the
 * ball log rather than storing it, so the two can never disagree.
 *
 * This is the screen that answers "why bother scoring?". A scorer taps 240
 * times over three hours; this is what they get for it.
 */
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { BattingCareerView, BowlingCareerView } from '@open-innings/shared';
import { api } from '../../../lib/api';
import { useApiQuery } from '../../../lib/use-api';
import { Button, Card, ErrorBanner, Kicker, LoadingScreen } from '../../../components/ui';

/** Formats a nullable rate. Null is "—", never 0 and never Infinity. */
function rate(value: number | null, digits = 2): string {
  return value === null ? '—' : value.toFixed(digits);
}

/** One figure and its label — the spec-sheet grammar from the design system. */
function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View className="min-w-[86px]">
      <Text className="text-foreground font-heading text-[30px] leading-none">{value}</Text>
      <Text className="text-steel-700 font-heading mt-1.5 text-[10px] uppercase tracking-[1.6px]">
        {label}
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-7">
      <Kicker>{title}</Kicker>
      <View className="bg-border mb-4 mt-3 h-px" />
      {children}
    </View>
  );
}

function BattingFigures({ batting }: { batting: BattingCareerView }) {
  return (
    <View className="flex-row flex-wrap gap-x-7 gap-y-5">
      <Figure value={String(batting.runs)} label="Runs" />
      <Figure
        value={`${batting.highScore}${batting.highScoreNotOut ? '*' : ''}`}
        label="High score"
      />
      <Figure value={rate(batting.average)} label="Average" />
      <Figure value={rate(batting.strikeRate, 1)} label="Strike rate" />
      <Figure value={String(batting.innings)} label="Innings" />
    </View>
  );
}

function BowlingFigures({ bowling }: { bowling: BowlingCareerView }) {
  return (
    <View className="flex-row flex-wrap gap-x-7 gap-y-5">
      <Figure value={String(bowling.wickets)} label="Wickets" />
      <Figure
        value={bowling.bestWickets > 0 ? `${bowling.bestWickets}-${bowling.bestRuns}` : '—'}
        label="Best"
      />
      <Figure value={rate(bowling.average)} label="Average" />
      <Figure value={rate(bowling.economy)} label="Economy" />
    </View>
  );
}

export default function PlayerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const query = useApiQuery((t, signal) => api.playerStats(t, id, signal), [id]);

  if (query.isLoading) return <LoadingScreen />;

  if (query.error || !query.data) {
    return (
      <SafeAreaView className="bg-background flex-1 justify-center p-6">
        <Stack.Screen options={{ title: 'Player' }} />
        <ErrorBanner message={query.error ?? 'Could not load this player.'} />
        <View className="mt-4">
          <Button label="Back" variant="secondary" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const { player, batting, bowling, fielding, season, form, milestones } = query.data.career;
  const hasPlayed = batting.innings > 0 || bowling.innings > 0;
  const hasFielding = fielding.catches + fielding.runOuts + fielding.stumpings > 0;

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ title: player.fullName, headerShown: false }} />

      <ScrollView contentContainerClassName="px-5 pb-10 pt-4">
        <Kicker>Player</Kicker>
        <Text className="text-foreground font-heading mt-2 text-[40px] uppercase leading-[40px]">
          {player.fullName}
        </Text>

        {milestones.length > 0 ? (
          <View className="mt-4 flex-row flex-wrap gap-2">
            {milestones.map((m) => (
              <View key={m} className="border-steel-300 bg-steel-100 border px-2.5 py-1">
                <Text className="text-steel-800 font-heading text-[11px] uppercase tracking-[1.2px]">
                  {m}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {!hasPlayed ? (
          <View className="mt-7">
            <Card>
              <Kicker>No innings yet</Kicker>
              <Text className="text-foreground/75 mt-3 text-[15px] leading-6">
                This player hasn&rsquo;t batted or bowled in a scored match. The record fills itself
                in as matches are scored — nothing here is typed in by hand.
              </Text>
            </Card>
          </View>
        ) : null}

        {/* This season leads, because it is the number being argued about. */}
        {season ? (
          <Section title={`This season — ${season.label}`}>
            {season.batting.innings > 0 ? <BattingFigures batting={season.batting} /> : null}
            {season.bowling.wickets > 0 ? (
              <View className={season.batting.innings > 0 ? 'mt-5' : ''}>
                <BowlingFigures bowling={season.bowling} />
              </View>
            ) : null}
          </Section>
        ) : null}

        {batting.innings > 0 ? (
          <Section title={season ? 'Batting — career' : 'Batting'}>
            <BattingFigures batting={batting} />
            <View className="border-border mt-5 border-t pt-4">
              <Text className="text-foreground/70 font-heading text-[13px]">
                {batting.balls} balls {' · '} {batting.fours} fours {' · '} {batting.sixes} sixes
                {' · '} {batting.notOuts} not out
              </Text>
              {batting.fifties + batting.hundreds > 0 ? (
                <Text className="text-foreground/70 font-heading mt-1 text-[13px]">
                  {batting.fifties} fifties {' · '} {batting.hundreds} hundreds
                </Text>
              ) : null}
            </View>
          </Section>
        ) : null}

        {form.length > 0 ? (
          <Section title={`Form — last ${form.length}`}>
            <View className="flex-row flex-wrap gap-2">
              {form.map((f, i) => (
                <View
                  key={`${f.matchId}-${i}`}
                  className="border-border min-w-[74px] border px-3 py-2.5"
                >
                  <Text className="text-foreground font-heading text-[22px] leading-none">
                    {f.runs}
                    {f.notOut ? '*' : ''}
                  </Text>
                  <Text className="text-foreground/55 font-heading mt-1 text-[12px]">
                    ({f.balls})
                  </Text>
                  {f.opponent ? (
                    <Text className="text-foreground/60 mt-1.5 text-[11px]" numberOfLines={1}>
                      v {f.opponent}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        {bowling.innings > 0 ? (
          <Section title={season ? 'Bowling — career' : 'Bowling'}>
            <BowlingFigures bowling={bowling} />
          </Section>
        ) : null}

        {hasFielding ? (
          <Section title="Fielding">
            <View className="flex-row flex-wrap gap-x-7 gap-y-5">
              <Figure value={String(fielding.catches)} label="Catches" />
              <Figure value={String(fielding.runOuts)} label="Run outs" />
              <Figure value={String(fielding.stumpings)} label="Stumpings" />
            </View>
          </Section>
        ) : null}

        <Text className="text-foreground/55 mt-8 text-[12px] leading-5">
          Every figure is computed from the ball log, not entered by hand — so correcting a ball
          corrects the record.
        </Text>

        <View className="mt-6">
          <Button label="Back to players" variant="secondary" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
