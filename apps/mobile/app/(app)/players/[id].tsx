/**
 * E1 — the career record.
 *
 * The screen that answers "why bother scoring?". A scorer taps two hundred
 * times over three hours; twenty-two people get this out of it, and it is the
 * only page here anyone would put in a bio.
 *
 * The mobile twin of `/p/[playerId]` on the web. Same numbers, same source —
 * both read `GET /api/players/[id]/stats`, which folds everything from the
 * ball log rather than storing it, so the two cannot disagree and a corrected
 * ball corrects the career.
 */
import { useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { BattingCareerView, FormEntryView } from '@open-innings/shared';
import { api } from '../../../lib/api';
import { shareUrls } from '../../../lib/config';
import { usePublicQuery } from '../../../lib/use-api';
import { Button, ErrorBanner, Kicker, LoadingScreen } from '../../../components/ui';

/** A nullable rate. Null is "—", never 0 and never Infinity. */
function rate(value: number | null, digits = 2): string {
  return value === null ? '—' : value.toFixed(digits);
}

/** Thousands separated — "1,284" is the headline figure and wants reading. */
function grouped(n: number): string {
  return n.toLocaleString('en-IN');
}

const STYLE_LABELS: Record<string, string> = {
  right_hand: 'Right-hand bat',
  left_hand: 'Left-hand bat',
};

const ROLE_LABELS: Record<string, string> = {
  batsman: 'Top order',
  bowler: 'Bowler',
  all_rounder: 'All-rounder',
  wicket_keeper: 'Keeper',
  wicket_keeper_batsman: 'Keeper-bat',
};

/** One cell in the stats grid: a figure over its label. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="border-border w-1/4 border-b border-r px-2.5 py-3">
      <Text className="text-foreground font-heading text-[19px] leading-[21px]" numberOfLines={1}>
        {value}
      </Text>
      <Text className="font-heading mt-0.5 text-[8.5px] uppercase tracking-[1.2px] text-neutral-600">
        {label}
      </Text>
    </View>
  );
}

/**
 * The form strip, as a bar chart.
 *
 * Bars are scaled against the best score in the window, not against a fixed
 * ceiling — the point is the shape of a run of scores, and 34 next to 74 says
 * more than either does against an imaginary 100.
 */
function FormChart({ form }: { form: FormEntryView[] }) {
  // Oldest on the left. The API sends newest first, which is right for a list
  // and backwards for a chart people read left to right as time.
  const entries = [...form].reverse();
  const best = Math.max(...entries.map((f) => f.runs), 1);

  return (
    <View>
      <View className="h-[92px] flex-row items-end gap-2">
        {entries.map((f, i) => (
          <View key={`${f.matchId}-${i}`} className="flex-1 items-center">
            <View
              // A duck still gets a visible sliver — a zero-height bar reads
              // as "did not play", which is a different thing entirely.
              style={{ height: Math.max(4, (f.runs / best) * 88) }}
              className={`w-full ${f.notOut ? 'bg-primary' : 'bg-steel-300'}`}
            />
          </View>
        ))}
      </View>
      <View className="mt-1.5 flex-row gap-2">
        {entries.map((f, i) => (
          <Text
            key={`${f.matchId}-label-${i}`}
            className="text-foreground font-heading flex-1 text-center text-[12px]"
            numberOfLines={1}
          >
            {f.runs}
            {f.notOut ? '*' : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function PlayerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [scope, setScope] = useState<'season' | 'career'>('season');

  const query = usePublicQuery((t, signal) => api.playerStats(t, id, signal), [id]);

  if (query.isLoading) return <LoadingScreen />;

  if (query.error || !query.data) {
    return (
      <SafeAreaView className="bg-background flex-1 justify-center p-6">
        <Stack.Screen options={{ headerShown: false }} />
        <ErrorBanner message={query.error ?? 'Could not load this player.'} />
        <View className="mt-4">
          <Button label="Back" variant="secondary" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const { player, matches, batting, bowling, fielding, season, form, milestones } =
    query.data.career;
  const hasPlayed = batting.innings > 0 || bowling.innings > 0;

  // The toggle only means something when the two differ. `season` is null when
  // the whole career is one season, and then "This season" and "Career" would
  // show identical numbers under two labels.
  const showing: BattingCareerView = scope === 'season' && season ? season.batting : batting;
  const showingLabel =
    scope === 'season' && season ? `Batting · ${season.label}` : 'Batting · career';

  const identity = [
    // Club would go first. There is no club field on a player — see
    // docs/wiring.md — so the line starts at the role.
    player.role ? ROLE_LABELS[player.role] : null,
    player.battingStyle ? STYLE_LABELS[player.battingStyle] : null,
  ].filter(Boolean);

  async function share() {
    await Share.share({
      message: `${player.fullName} — ${grouped(batting.runs)} career runs in ${matches} match${
        matches === 1 ? '' : 'es'
      }\n${shareUrls.player(id)}`,
    });
  }

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerClassName="pb-6">
        {/* The plate. Reversed, like the score plate — this is the object the
            whole screen is about. */}
        <View className="bg-scoreboard px-4 pb-4 pt-3">
          <View className="flex-row items-center justify-between gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => router.back()}
              className="-ml-1 h-7 w-7 items-center justify-center active:opacity-60"
            >
              <Text className="text-scoreboard-muted text-lg">‹</Text>
            </Pressable>
            <Text
              className="text-scoreboard-muted font-heading min-w-0 flex-1 text-[8.5px] uppercase tracking-[1.3px]"
              numberOfLines={1}
            >
              openinnings.com/p/{id.slice(0, 8)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share this career page"
              onPress={() => void share()}
              className="shrink-0 px-1 py-1 active:opacity-60"
            >
              <Text className="text-scoreboard-accent font-heading text-[9.5px] uppercase tracking-[1.3px]">
                Share
              </Text>
            </Pressable>
          </View>

          <Text className="text-scoreboard-text font-heading mt-2.5 text-[32px] uppercase leading-[34px]">
            {player.fullName}
          </Text>
          {identity.length > 0 ? (
            <Text
              className="text-scoreboard-muted font-heading mt-1 text-[9px] uppercase tracking-[1.3px]"
              numberOfLines={1}
            >
              {identity.join('  ·  ')}
            </Text>
          ) : null}

          <View className="mt-4 flex-row gap-7">
            <PlateFigure value={grouped(batting.runs)} label="Career runs" />
            <PlateFigure value={String(matches)} label="Matches" />
            <PlateFigure
              value={`${batting.highScore}${batting.highScoreNotOut ? '*' : ''}`}
              label="Highest"
            />
          </View>
        </View>

        {!hasPlayed ? (
          <View className="border-border mx-4 mt-5 border p-4">
            <Kicker>No innings yet</Kicker>
            <Text className="text-foreground/75 mt-2.5 text-[14px] leading-5">
              This player hasn&rsquo;t batted or bowled in a scored match. The record fills itself
              in as matches are scored — nothing here is typed in by hand.
            </Text>
          </View>
        ) : null}

        {/* Season / career. Only when there is a season to contrast. */}
        {season ? (
          <View className="flex-row px-4 pt-4">
            {(
              [
                ['season', 'This season'],
                ['career', 'Career'],
              ] as const
            ).map(([key, label]) => (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: scope === key }}
                onPress={() => setScope(key)}
                className={`h-10 flex-1 items-center justify-center border ${
                  scope === key ? 'bg-primary border-primary' : 'border-border'
                } active:opacity-80`}
              >
                <Text
                  className={`font-heading text-[11.5px] uppercase tracking-[1.3px] ${
                    scope === key ? 'text-primary-foreground' : 'text-foreground'
                  }`}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {batting.innings > 0 ? (
          <View className="px-4 pt-5">
            <Kicker>{showingLabel}</Kicker>
            {/* Four across, two rows, on a drawn grid. border-l/-t on the
                wrapper so the outer edges close. */}
            <View className="border-border mt-2.5 flex-row flex-wrap border-l border-t">
              <Stat value={grouped(showing.runs)} label="Runs" />
              <Stat value={rate(showing.average, 1)} label="Avg" />
              <Stat value={rate(showing.strikeRate, 1)} label="SR" />
              <Stat
                value={`${showing.highScore}${showing.highScoreNotOut ? '*' : ''}`}
                label="HS"
              />
              <Stat value={String(showing.fours)} label="Fours" />
              <Stat value={String(showing.sixes)} label="Sixes" />
              <Stat value={String(showing.fifties + showing.hundreds)} label="50s / 100s" />
              <Stat value={String(showing.innings)} label="Inns" />
            </View>
          </View>
        ) : null}

        {form.length > 0 ? (
          <View className="px-4 pt-6">
            <Kicker>Form · last {form.length}</Kicker>
            <View className="mt-3">
              <FormChart form={form} />
            </View>
          </View>
        ) : null}

        {/* Bowling and fielding side by side — neither is long enough alone. */}
        {bowling.innings > 0 || fielding.catches + fielding.runOuts + fielding.stumpings > 0 ? (
          <View className="flex-row gap-6 px-4 pt-6">
            <View className="min-w-0 flex-1">
              <Kicker>Bowling · career</Kicker>
              <View className="mt-2">
                <Line label="Wickets" value={String(bowling.wickets)} />
                <Line
                  label="Best"
                  value={
                    bowling.bestWickets > 0 ? `${bowling.bestWickets}/${bowling.bestRuns}` : '—'
                  }
                />
                <Line label="Econ" value={rate(bowling.economy, 1)} />
              </View>
            </View>
            <View className="min-w-0 flex-1">
              <Kicker>Fielding · career</Kicker>
              <View className="mt-2">
                <Line label="Catches" value={String(fielding.catches)} />
                <Line label="Run outs" value={String(fielding.runOuts)} />
                <Line label="Stumpings" value={String(fielding.stumpings)} />
              </View>
            </View>
          </View>
        ) : null}

        {milestones.length > 0 ? (
          <View className="px-4 pt-6">
            <Kicker>Milestones</Kicker>
            <View className="border-border mt-2 border-t">
              {milestones.map((m) => (
                <View
                  key={m.label}
                  className="border-border flex-row items-baseline justify-between gap-3 border-b py-2.5"
                >
                  <Text className="text-foreground min-w-0 flex-1 text-[14px]" numberOfLines={1}>
                    {m.label}
                  </Text>
                  {/* Appearances ago, not days. "Last match" reads better
                      than "0 ago", and it is the one people care about. */}
                  <Text className="font-heading shrink-0 text-[9px] uppercase tracking-[1.2px] text-neutral-600">
                    {m.matchesAgo === 0 ? 'Last match' : `${m.matchesAgo} ago`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Text className="text-foreground/55 px-4 pt-6 text-[12px] leading-[18px]">
          Every figure is derived from ball logs, so nothing is typed twice and a corrected ball
          corrects a career.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PlateFigure({ value, label }: { value: string; label: string }) {
  return (
    <View className="shrink-0">
      <Text className="text-scoreboard-text font-heading text-[26px] leading-[26px]">{value}</Text>
      <Text className="text-scoreboard-muted font-heading mt-1 text-[8.5px] uppercase tracking-[1.3px]">
        {label}
      </Text>
    </View>
  );
}

/** A label-and-figure row, for the narrow bowling and fielding columns. */
function Line({ label, value }: { label: string; value: string }) {
  return (
    <View className="border-border flex-row items-baseline justify-between gap-2 border-b py-2">
      <Text className="text-foreground/70 min-w-0 flex-1 text-[13px]" numberOfLines={1}>
        {label}
      </Text>
      <Text className="text-foreground font-heading shrink-0 text-[14px]">{value}</Text>
    </View>
  );
}
