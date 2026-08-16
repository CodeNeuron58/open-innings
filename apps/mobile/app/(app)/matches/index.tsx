/**
 * B1 — Matches.
 *
 * The home screen. In-progress matches first, because the only reason to open
 * this app mid-afternoon is to get back to the one you are scoring; finished
 * ones below as a record.
 *
 * Two things in the design are not wired and are marked where they appear:
 * the "synced" timestamp (there is no offline queue to be synced from) and
 * the follower count (nobody can follow a match yet).
 */
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import type { MatchListResponse } from '@open-innings/shared';
import { api } from '../../../lib/api';
import { useApiQuery } from '../../../lib/use-api';
import { Button, ErrorBanner, Kicker, LoadingScreen } from '../../../components/ui';

type MatchRow = MatchListResponse['matches'][number];

function isLive(m: MatchRow): boolean {
  return m.status === 'live' || m.status === 'in_progress';
}

/** "8 Aug" — short, because the year is only interesting for old matches. */
function shortDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }).toUpperCase();
}

function LiveMatch({ match, onPress }: { match: MatchRow; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Resume ${match.title ?? 'match'}`}
      onPress={onPress}
      className="border-border border p-4 active:opacity-70"
    >
      <View className="flex-row items-center gap-2">
        <View className="bg-primary h-1.5 w-1.5" />
        <Text className="text-steel-700 font-heading text-[10px] uppercase tracking-[1.5px]">
          Live
        </Text>
        {/*
          Not wired: nothing counts followers yet. Left out rather than shown
          as zero, which would read as "nobody is watching".
        */}
      </View>

      <Text className="text-foreground font-heading mt-3 text-[17px]" numberOfLines={1}>
        {match.title ?? 'Match'}
      </Text>
      {match.venue ? (
        <Text className="text-foreground/55 mt-1 text-[12px]" numberOfLines={1}>
          {match.venue}
        </Text>
      ) : null}
      <Text className="text-foreground/70 font-heading mt-2 text-[12px] uppercase tracking-[1.2px]">
        {match.oversPerInnings} overs a side
      </Text>
    </Pressable>
  );
}

function FinishedMatch({ match, onPress }: { match: MatchRow; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={match.title ?? 'Match'}
      onPress={onPress}
      className="border-border border-b py-4 active:opacity-70"
    >
      <Text className="text-foreground font-heading text-[16px]" numberOfLines={1}>
        {match.title ?? 'Match'}
      </Text>
      <Text
        className="text-foreground/60 font-heading mt-1.5 text-[11px] uppercase tracking-[1.2px]"
        numberOfLines={1}
      >
        {[
          match.summary,
          `${match.oversPerInnings} ov`,
          shortDate(match.startedAt ?? match.createdAt),
        ]
          .filter(Boolean)
          .join('  ·  ')}
      </Text>
    </Pressable>
  );
}

export default function Matches() {
  const router = useRouter();
  const query = useApiQuery<MatchListResponse>((t, signal) => api.matches(t, signal), []);

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
          {/*
            The design shows "SYNCED 15:41" here. Omitted: there is no offline
            queue, so every ball is already on the server and a sync time would
            be reporting on a thing that does not exist. Comes back with
            offline-first — see docs/wiring.md.
          */}
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
              <Text className="text-foreground/70 mt-3 text-[14px] leading-5">
                Start one and the scorecard, the commentary and everyone&rsquo;s career records
                build themselves from the balls you tap.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <FinishedMatch match={item} onPress={() => router.push(`/matches/${item.id}/score`)} />
        )}
      />

      {/* No MatchTabs here: Score and Card need a match id and this screen is
          the list of all of them. See docs/wiring.md. */}
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
    </SafeAreaView>
  );
}
