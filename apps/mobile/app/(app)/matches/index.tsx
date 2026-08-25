import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import type { MatchListResponse } from '@open-innings/shared';
import { api } from '../../../lib/api';
import { useApiQuery } from '../../../lib/use-api';
import { Button, ErrorBanner, Kicker } from '../../../components/ui';
import { SkeletonScreen } from '../../../components/Skeleton';
import { MatchSettings } from '../../../components/MatchSettings';
// The rows themselves live beside the public feed's, so the two lists cannot
// come to describe the same match differently. See components/MatchCard.tsx.
import { FinishedMatch, LiveMatch, isLive, type MatchRow } from '../../../components/MatchCard';

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

  // The shape of the list, so nothing jumps when it arrives.
  if (query.isLoading) return <SkeletonScreen rows={3} tall />;

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
                    onOptions={() => setSettingsFor(m)}
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
            onOptions={() => setSettingsFor(item)}
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
