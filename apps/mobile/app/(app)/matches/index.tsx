/**
 * Match list — the signed-in landing screen.
 *
 * Scoring and match creation land here next. For now this proves the full
 * authenticated path end to end: a bearer token out of the keystore, an
 * authorised request, and rows scoped server-side to this user.
 */
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { MatchSummary } from '@open-innings/shared';
import { useSession } from '../../../lib/session';
import { api } from '../../../lib/api';
import { useApiQuery } from '../../../lib/use-api';
import { Button, ErrorBanner, LoadingScreen } from '../../../components/ui';

export default function Matches() {
  const router = useRouter();
  const { user, signOut } = useSession();
  const { data, error, isLoading, isRefreshing, refresh } = useApiQuery((token, signal) =>
    api.matches(token, signal),
  );

  const matches = data?.matches ?? null;

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView className="bg-background flex-1">
      <View className="flex-row items-start justify-between px-5 pb-2 pt-4">
        <View className="flex-1">
          <Text className="text-primary text-xs font-bold uppercase tracking-widest">
            Open Innings
          </Text>
          <Text className="text-foreground text-2xl font-bold">Matches</Text>
          {user ? (
            <Text className="text-muted-foreground text-sm">{user.displayName ?? user.email}</Text>
          ) : null}
        </View>
        <View className="w-24">
          <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
        </View>
      </View>

      {error ? (
        <View className="px-5 pb-3">
          <ErrorBanner message={error} />
        </View>
      ) : null}

      <FlatList
        data={matches ?? []}
        keyExtractor={(m) => m.id}
        contentContainerClassName="px-5 pb-8 gap-3"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        ListEmptyComponent={
          error ? null : (
            <View className="border-border bg-card mt-6 gap-3 rounded-2xl border p-6">
              <Text className="text-foreground text-base font-semibold">No matches yet</Text>
              <Text className="text-muted-foreground text-sm">
                You&apos;ll need players and two teams first, then you can start scoring.
              </Text>
              <Button label="Start a match" onPress={() => router.push('/matches/new')} />
            </View>
          )
        }
        renderItem={({ item }) => <MatchRow match={item} />}
      />

      <View className="border-border gap-3 border-t px-5 py-3">
        <Button label="Start a match" onPress={() => router.push('/matches/new')} />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button label="Teams" variant="secondary" onPress={() => router.push('/teams')} />
          </View>
          <View className="flex-1">
            <Button label="Players" variant="secondary" onPress={() => router.push('/players')} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function MatchRow({ match }: { match: MatchSummary }) {
  const isLive = match.status === 'live';

  return (
    <View className="border-border bg-card rounded-2xl border p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-foreground flex-1 text-base font-semibold" numberOfLines={1}>
          {match.title ?? 'Untitled match'}
        </Text>
        {isLive ? (
          <View className="bg-live rounded-full px-2 py-0.5">
            <Text className="text-live-foreground text-[10px] font-bold uppercase">Live</Text>
          </View>
        ) : (
          <Text className="text-muted-foreground text-xs uppercase">{match.status}</Text>
        )}
      </View>

      <Text className="text-muted-foreground mt-1 text-sm">
        {match.oversPerInnings} overs
        {match.venue ? ` · ${match.venue}` : ''}
      </Text>

      {match.summary ? (
        <Text className="text-foreground mt-2 text-sm font-medium">{match.summary}</Text>
      ) : null}
    </View>
  );
}
