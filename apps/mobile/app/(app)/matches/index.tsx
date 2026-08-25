import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { formatOvers } from '@open-innings/scoring';
import type { MatchListResponse } from '@open-innings/shared';
import { api } from '../../../lib/api';
import { formatLabel } from '../../../lib/formats';
import { useApiQuery } from '../../../lib/use-api';
import { Button, ErrorBanner, Kicker, LoadingScreen } from '../../../components/ui';
import { MatchSettings } from '../../../components/MatchSettings';

type MatchRow = MatchListResponse['matches'][number];

function isLive(m: MatchRow): boolean {
  return m.status === 'live' || m.status === 'in_progress';
}

/**
 * What to call a match that was never given a title.
 *
 * Every row used to read "Match", because the wizard had no field for a title
 * and the list had only team ids to work with. Both are fixed; this is the
 * fallback for the matches created in between, and for anyone who does not
 * want to name their Sunday friendly.
 */
function titleOf(m: MatchRow): string {
  if (m.title) return m.title;
  if (m.teamAName && m.teamBName) return `${m.teamAName} v ${m.teamBName}`;
  return 'Match';
}

/** `142-6 (17.3)` — the innings, the way a scoreboard says it. */
function lineOf(m: MatchRow, innings: MatchRow['innings'][number]): string {
  const name = innings.battingTeamId === m.teamAId ? (m.teamAName ?? '') : (m.teamBName ?? '');
  // `formatOvers`, not a local `Math.floor(balls / 6)` — the app has one way
  // of writing an over count and this is it.
  return `${name} ${innings.runs}-${innings.wickets} (${formatOvers(innings.ballsBowled)})`;
}

/**
 * How far off the chase is, where there is one.
 *
 * The single most useful sentence about a live match, and the list had nowhere
 * to put it because it had no score to put it beside.
 */
function chaseOf(m: MatchRow, innings: MatchRow['innings'][number]): string | null {
  if (innings.target === null || innings.status === 'completed') return null;
  const needed = Math.max(0, innings.target - innings.runs);
  const ballsLeft = Math.max(0, m.oversPerInnings * 6 - innings.ballsBowled);
  if (ballsLeft === 0) return null;
  return `Need ${needed} off ${ballsLeft}`;
}

/** Format date as "8 Aug" */
function shortDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }).toUpperCase();
}

function LiveMatch({
  match,
  onPress,
  onLongPress,
}: {
  match: MatchRow;
  onPress: () => void;
  onLongPress: () => void;
}) {
  // The innings being played now — the last one on the sheet.
  const current = match.innings[match.innings.length - 1] ?? null;
  const chase = current ? chaseOf(match, current) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        current
          ? `Resume ${titleOf(match)} — ${lineOf(match, current)}${chase ? `. ${chase}` : ''}`
          : `Resume ${titleOf(match)}`
      }
      accessibilityHint="Hold for options, or use the options button"
      onPress={onPress}
      onLongPress={onLongPress}
      className="border-border border p-4 active:opacity-70"
    >
      <View className="flex-row items-center gap-2">
        <View className="bg-primary h-1.5 w-1.5" />
        <Text className="text-steel-700 font-heading text-[11px] uppercase tracking-[1.5px]">
          Live
        </Text>
        {/* Shows active watchers, hidden if < 2. */}
        {match.watching >= 2 ? (
          <Text className="text-foreground/70 font-heading ml-auto text-[11px] uppercase tracking-[1.3px]">
            {match.watching} watching
          </Text>
        ) : null}

        {/* Settings, edit, abandon and delete used to live *only* behind a
            long-press. That gesture is not discoverable — it was named in an
            accessibilityHint and nowhere a sighted user would find it — so a
            match started by mistake could not be got rid of. The hold still
            works; it is a shortcut now rather than the only door. */}
        <MoreButton
          label={`Options for ${titleOf(match)}`}
          onPress={onLongPress}
          className={match.watching >= 2 ? '' : 'ml-auto'}
        />
      </View>

      <Text className="text-foreground font-heading mt-3 text-[17px]" numberOfLines={1}>
        {titleOf(match)}
      </Text>

      {/* The score, which is the reason this row is on the screen. */}
      {current ? (
        <View className="mt-2.5">
          <Text className="text-foreground font-heading text-[22px]" numberOfLines={1}>
            {lineOf(match, current)}
          </Text>
          {chase ? (
            <Text className="text-steel-700 font-heading mt-1 text-[13.5px]">{chase}</Text>
          ) : null}
        </View>
      ) : (
        <Text className="text-foreground/60 mt-2 text-[13.5px]">Not a ball bowled yet</Text>
      )}

      <Text className="text-foreground/70 font-heading mt-2.5 text-[13.5px] uppercase tracking-[1.2px]">
        {[formatLabel(match.format), `${match.oversPerInnings} overs a side`, match.venue]
          .filter(Boolean)
          .join('  ·  ')}
      </Text>
    </Pressable>
  );
}

function FinishedMatch({
  match,
  onPress,
  onLongPress,
}: {
  match: MatchRow;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titleOf(match)}
      accessibilityHint="Hold for options, or use the options button"
      onPress={onPress}
      onLongPress={onLongPress}
      className="border-border border-b py-4 active:opacity-70"
    >
      <View className="flex-row items-center gap-2">
        <Text className="text-foreground font-heading min-w-0 flex-1 text-[16px]" numberOfLines={1}>
          {titleOf(match)}
        </Text>
        <MoreButton label={`Options for ${titleOf(match)}`} onPress={onLongPress} />
      </View>
      <Text
        className="text-foreground/60 font-heading mt-1.5 text-[11px] uppercase tracking-[1.2px]"
        numberOfLines={1}
      >
        {[
          match.summary,
          formatLabel(match.format) ?? `${match.oversPerInnings} ov`,
          shortDate(match.startedAt ?? match.createdAt),
        ]
          .filter(Boolean)
          .join('  ·  ')}
      </Text>
    </Pressable>
  );
}

/**
 * The way in to a match's settings that does not require knowing a gesture.
 *
 * Sized to the kit's own 44pt minimum and given a real label, because "⋯"
 * tells a screen reader nothing on its own.
 */
function MoreButton({
  label,
  onPress,
  className = '',
}: {
  label: string;
  onPress: () => void;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      className={`border-border h-11 w-11 shrink-0 items-center justify-center border active:opacity-70 ${className}`}
    >
      <Text className="text-foreground font-heading text-[17px] leading-[17px]">⋯</Text>
    </Pressable>
  );
}

export default function Matches() {
  const router = useRouter();
  const query = useApiQuery<MatchListResponse>((t, signal) => api.matches(t, signal), []);

  useFocusEffect(
    useCallback(() => {
      void query.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: refresh is stable
    }, [query.refresh]),
  );

  // Corrections and settings are accessed via long press.
  const [settingsFor, setSettingsFor] = useState<MatchRow | null>(null);

  if (query.isLoading) return <LoadingScreen />;

  const matches = query.data?.matches ?? [];
  const live = matches.filter(isLive);
  const done = matches.filter((m) => !isLive(m));

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <View className="px-5 pb-3 pt-4">
        <View className="flex-row items-baseline justify-between">
          <Text className="text-foreground font-heading text-[26px] uppercase">Matches</Text>
          {/* Sync status omitted as all balls sync immediately. */}
        </View>

        <View className="mt-4">
          <Button label="New match" onPress={() => router.push('/matches/new')} />
        </View>
      </View>

      {query.error ? (
        <View className="px-5 pb-3">
          <ErrorBanner message={query.error} />
        </View>
      ) : null}

      <FlatList
        data={done}
        keyExtractor={(m) => m.id}
        contentContainerClassName="px-5 pb-10"
        refreshControl={
          <RefreshControl refreshing={query.isRefreshing} onRefresh={query.refresh} />
        }
        ListHeaderComponent={
          live.length > 0 ? (
            <View className="pb-6">
              <View className="pb-3">
                <Kicker>In progress</Kicker>
              </View>
              <View className="gap-3">
                {live.map((m) => (
                  <LiveMatch
                    key={m.id}
                    match={m}
                    onPress={() => router.push(`/matches/${m.id}/score`)}
                    onLongPress={() => setSettingsFor(m)}
                  />
                ))}
              </View>
              {done.length > 0 ? (
                <View className="pb-1 pt-7">
                  <Kicker>Completed</Kicker>
                </View>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          live.length === 0 && !query.error ? (
            <View className="border-border mt-2 border p-5">
              <Kicker>No matches yet</Kicker>
              <Text className="text-foreground/75 mt-3 text-[15px] leading-5">
                Start one and the scorecard, the commentary and everyone&rsquo;s career records
                build themselves from the balls you tap.
              </Text>
              {/* An empty state is the on-ramp, not a consolation note. This
                  one was three sentences with no action on it, and the only
                  control on the screen led to a wizard that would refuse
                  until two teams existed. */}
              <View className="mt-4">
                <Button
                  label="Start your first match"
                  onPress={() => router.push('/matches/new')}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/teams')}
                className="mt-3 h-11 justify-center active:opacity-60"
              >
                <Text className="text-steel-700 font-heading text-[13.5px] uppercase tracking-[1.3px]">
                  Set up teams and players first
                </Text>
              </Pressable>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <FinishedMatch
            match={item}
            onPress={() => router.push(`/matches/${item.id}/score`)}
            onLongPress={() => setSettingsFor(item)}
          />
        )}
      />

      {/* No MatchTabs on global matches list. */}
      <View className="border-border flex-row gap-2 border-t px-5 py-3">
        <View className="flex-1">
          <Button label="Players" variant="secondary" onPress={() => router.push('/players')} />
        </View>
        <View className="flex-1">
          <Button label="Teams" variant="secondary" onPress={() => router.push('/teams')} />
        </View>
        <View className="flex-1">
          <Button label="More" variant="secondary" onPress={() => router.push('/more')} />
        </View>
      </View>

      {settingsFor ? (
        <MatchSettings
          match={settingsFor}
          onDone={() => {
            setSettingsFor(null);
            void query.refresh();
          }}
          onClose={() => setSettingsFor(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}
