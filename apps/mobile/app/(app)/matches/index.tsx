import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import type { MatchListResponse } from '@open-innings/shared';
import { api } from '../../../lib/api';
import { formatLabel } from '../../../lib/formats';
import { useApiQuery } from '../../../lib/use-api';
import { useTheme } from '../../../lib/use-theme';
import { Button, ErrorBanner, Kicker } from '../../../components/ui';
import { SkeletonScreen } from '../../../components/Skeleton';
import { MatchSettings } from '../../../components/MatchSettings';
import { StartScheduledMatch } from '../../../components/StartScheduledMatch';
// The rows themselves live beside the public feed's, so the two lists cannot
// come to describe the same match differently. See components/MatchCard.tsx.
import {
  FinishedMatch,
  LiveMatch,
  ScheduledMatch,
  isLive,
  isScheduled,
  type MatchRow,
} from '../../../components/MatchCard';

/** Everything about a match somebody might type to find it again. */
function searchable(m: MatchRow): string {
  return [m.title, m.teamAName, m.teamBName, m.venue, formatLabel(m.format)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

type Section = { key: string; matches: MatchRow[] };

/**
 * A season, as months.
 *
 * Grouped rather than sorted-and-headed, so a `FlatList` still virtualises —
 * the sections are the rows, and a club with four hundred matches renders the
 * handful on screen. Months rather than seasons because a season starts on a
 * different date in every country this is used in, and inventing one would be
 * wrong somewhere.
 */
function groupByMonth(rows: MatchRow[]): Section[] {
  const out: Section[] = [];
  for (const m of rows) {
    const when = new Date(m.startedAt ?? m.createdAt);
    const key = Number.isNaN(when.getTime())
      ? 'Undated'
      : when.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    const last = out[out.length - 1];
    if (last && last.key === key) last.matches.push(m);
    else out.push({ key, matches: [m] });
  }
  return out;
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
  const [search, setSearch] = useState('');
  /** The scheduled match being started — see `ScheduledMatch`. */
  const [startingMatch, setStartingMatch] = useState<MatchRow | null>(null);
  const theme = useTheme();

  // The shape of the list, so nothing jumps when it arrives.
  if (query.isLoading) return <SkeletonScreen rows={3} tall />;

  const matches = query.data?.matches ?? [];
  const live = matches.filter(isLive);
  // Set up and waiting. Above the finished ones, below the ones being played.
  const upcoming = matches.filter(isScheduled);

  /*
   * Filtered, then grouped by month.
   *
   * A club plays forty matches in a season and this was one flat list, newest
   * first, with nothing to search and no way to say "the one against Rovers in
   * June". The two together are what make a season's worth of cricket
   * findable — a filter for when you know the name, headings for when you only
   * know roughly when.
   *
   * Client-side because the list is already fully loaded: the endpoint returns
   * every match the account owns, so a server round trip per keystroke would
   * buy nothing.
   */
  const term = search.trim().toLowerCase();
  const done = matches
    .filter((m) => !isLive(m) && !isScheduled(m))
    .filter((m) => (term.length === 0 ? true : searchable(m).includes(term)));

  const sections = groupByMonth(done);

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

      {/* Only once there is enough to be worth searching. Three matches do not
          need a filter, and an empty one is just clutter. */}
      {matches.filter((m) => !isLive(m) && !isScheduled(m)).length >= 6 ? (
        <View className="px-5 pb-3">
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by team, title or ground"
            placeholderTextColor={theme.placeholder}
            accessibilityLabel="Search matches"
            autoCapitalize="none"
            autoCorrect={false}
            className="text-foreground border-input h-11 border bg-neutral-100 px-3 font-sans text-[14px]"
          />
        </View>
      ) : null}

      <FlatList
        data={sections}
        keyExtractor={(s) => s.key}
        contentContainerClassName="px-5 pb-10"
        refreshControl={
          <RefreshControl refreshing={query.isRefreshing} onRefresh={query.refresh} />
        }
        ListHeaderComponent={
          live.length > 0 || upcoming.length > 0 ? (
            <View className="pb-6">
              {live.length > 0 ? (
                <>
                  <View className="pb-3">
                    <Kicker>In progress</Kicker>
                  </View>
                  <View className="gap-3">
                    {live.map((m) => (
                      <LiveMatch
                        key={m.id}
                        match={m}
                        onPress={() => router.push(`/matches/${m.id}/score`)}
                        onOptions={() => setSettingsFor(m)}
                      />
                    ))}
                  </View>
                </>
              ) : null}

              {/* Set up and waiting. Tapping one asks who is opening, which is
                  the question that could not be answered when it was created. */}
              {upcoming.length > 0 ? (
                <>
                  <View className={`pb-3 ${live.length > 0 ? 'pt-7' : ''}`}>
                    <Kicker>Coming up</Kicker>
                  </View>
                  <View className="gap-3">
                    {upcoming.map((m) => (
                      <ScheduledMatch
                        key={m.id}
                        match={m}
                        onStart={() => setStartingMatch(m)}
                        onOptions={() => setSettingsFor(m)}
                      />
                    ))}
                  </View>
                </>
              ) : null}

              {done.length > 0 ? (
                <View className="pb-1 pt-7">
                  <Kicker>Completed</Kicker>
                </View>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          term.length > 0 ? (
            <View className="border-border mt-2 border p-5">
              <Kicker>Nothing matched</Kicker>
              <Text className="text-foreground/75 mt-3 text-[14px] leading-5">
                No match here mentions &ldquo;{search.trim()}&rdquo;. Try a team name, the title, or
                the ground.
              </Text>
            </View>
          ) : live.length === 0 && !query.error ? (
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
          <View className="pb-2 pt-4">
            <Kicker>{item.key}</Kicker>
            <View className="pt-1">
              {item.matches.map((m) => (
                <FinishedMatch
                  key={m.id}
                  match={m}
                  onPress={() => router.push(`/matches/${m.id}/score`)}
                  onOptions={() => setSettingsFor(m)}
                />
              ))}
            </View>
          </View>
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

      {/*
        Starting a match that was set up in advance.

        The squads and the toss were decided when it was created; the only
        thing missing is who opens, which is the one question that genuinely
        could not be answered the night before. It reuses the same sheet the
        Super Over uses — one "who's on" interaction, as `lib/openers.ts` says.
      */}
      {startingMatch ? (
        <StartScheduledMatch
          match={startingMatch}
          onStarted={() => {
            const id = startingMatch.id;
            setStartingMatch(null);
            void query.refresh();
            router.push({ pathname: '/matches/[id]/score', params: { id } });
          }}
          onCancel={() => setStartingMatch(null)}
        />
      ) : null}

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
