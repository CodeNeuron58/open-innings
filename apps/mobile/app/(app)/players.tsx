/**
 * Players — the roster a club scores with.
 *
 * Adding is inline rather than on its own screen. At a ground someone is
 * always missing from the list five minutes before the toss, and making that
 * a two-screen detour is how a scorer ends up with "Fielder 3" in the book.
 */
import { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { createPlayerSchema, type PlayerSummary } from '@open-innings/shared';
import { api } from '../../lib/api';
import { useApiQuery, useApiMutation } from '../../lib/use-api';
import { Button, ErrorBanner, Field, LoadingScreen } from '../../components/ui';

export default function Players() {
  const router = useRouter();
  const { data, error, isLoading, isRefreshing, refresh } = useApiQuery((token, signal) =>
    api.players(token, signal),
  );

  const mutation = useApiMutation();
  const [adding, setAdding] = useState(false);
  const [fullName, setFullName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  async function addPlayer() {
    setNameError(null);
    const parsed = createPlayerSchema.safeParse({ fullName });
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? 'Enter a name');
      return;
    }

    const result = await mutation.run((token) => api.createPlayer(token, parsed.data));
    if (result) {
      setFullName('');
      setAdding(false);
      await refresh();
    }
  }

  if (isLoading) return <LoadingScreen />;

  const players = data?.players ?? [];

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ title: 'Players' }} />

      <View className="flex-row items-center justify-between px-5 pb-3 pt-4">
        <View>
          <Text className="text-foreground text-2xl font-bold">Players</Text>
          <Text className="text-muted-foreground text-sm">
            {players.length} {players.length === 1 ? 'player' : 'players'}
          </Text>
        </View>
        <Button
          label={adding ? 'Cancel' : 'Add'}
          variant={adding ? 'ghost' : 'primary'}
          onPress={() => {
            setAdding((v) => !v);
            setNameError(null);
          }}
        />
      </View>

      {adding ? (
        <View className="border-border bg-card mx-5 mb-3 gap-3 rounded-2xl border p-4">
          <Field
            label="Full name"
            value={fullName}
            onChangeText={setFullName}
            error={nameError ?? mutation.fieldError?.message}
            placeholder="e.g. Rahul Sharma"
            autoCapitalize="words"
            autoFocus
            editable={!mutation.busy}
            onSubmitEditing={addPlayer}
            returnKeyType="done"
          />
          <Button label="Add player" onPress={addPlayer} loading={mutation.busy} />
        </View>
      ) : null}

      {error || mutation.error ? (
        <View className="px-5 pb-3">
          <ErrorBanner message={error ?? mutation.error ?? ''} />
        </View>
      ) : null}

      <FlatList
        data={players}
        keyExtractor={(p) => p.id}
        contentContainerClassName="px-5 pb-8 gap-2"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        ListEmptyComponent={
          <EmptyState onAdd={() => setAdding(true)} visible={!adding && !error} />
        }
        renderItem={({ item }) => <PlayerRow player={item} />}
      />

      <View className="border-border border-t px-5 py-3">
        <Button label="Back to matches" variant="ghost" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

function PlayerRow({ player }: { player: PlayerSummary }) {
  return (
    <View className="border-border bg-card flex-row items-center justify-between rounded-xl border px-4 py-3">
      <Text className="text-foreground text-base font-medium">{player.fullName}</Text>
      {player.role ? (
        <Text className="text-muted-foreground text-xs uppercase">
          {player.role.replace(/_/g, ' ')}
        </Text>
      ) : null}
    </View>
  );
}

function EmptyState({ onAdd, visible }: { onAdd: () => void; visible: boolean }) {
  if (!visible) return null;
  return (
    <View className="border-border bg-card mt-6 gap-3 rounded-2xl border p-6">
      <Text className="text-foreground text-base font-semibold">No players yet</Text>
      <Text className="text-muted-foreground text-sm">
        Add everyone who might bat or bowl. You&apos;ll pick squads from here when you create a
        team.
      </Text>
      <Button label="Add the first player" onPress={onAdd} />
    </View>
  );
}
