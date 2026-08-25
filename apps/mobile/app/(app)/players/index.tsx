/**
 * Players — the roster a club scores with.
 * Uses inline adding for quick access at the ground.
 */
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { createPlayerSchema, type PlayerSummary } from '@open-innings/shared';
import { api } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import { useApiQuery, useApiMutation } from '../../../lib/use-api';
import { Button, ErrorBanner, Field, Kicker, LoadingScreen } from '../../../components/ui';

export default function Players() {
  const router = useRouter();
  const { data, error, isLoading, isRefreshing, refresh } = useApiQuery((token, signal) =>
    api.players(token, signal),
  );

  const mutation = useApiMutation();
  const { playerId, refreshSession } = useSession();
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

  // Claim or release a player profile. Reversible via tap toggle.
  async function claim(player: PlayerSummary) {
    const mine = player.id === playerId;
    const done = await mutation.run<{ playerId: string | null }>((token) =>
      mine ? api.releasePlayer(token) : api.claimPlayer(token, player.id),
    );
    if (done !== null) await refreshSession();
  }

  if (isLoading) return <LoadingScreen />;

  const players = data?.players ?? [];

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ title: 'Players' }} />

      <View className="flex-row items-center justify-between px-5 pb-3 pt-4">
        <View>
          <Text className="text-foreground font-heading text-[26px] uppercase">Players</Text>
          <Text className="font-heading text-[10.5px] uppercase tracking-[1.4px] text-neutral-700">
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
        <View className="border-border mx-5 mb-3 gap-3 border p-4">
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
        renderItem={({ item }) => (
          <PlayerRow player={item} isMe={item.id === playerId} onClaim={() => void claim(item)} />
        )}
      />

      <View className="border-border border-t px-5 py-3">
        <Button label="Back to matches" variant="ghost" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

/** A row in the players list, linking to the career record. */
function PlayerRow({
  player,
  isMe,
  onClaim,
}: {
  player: PlayerSummary;
  isMe: boolean;
  onClaim: () => void;
}) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${player.fullName} — career record${isMe ? ', this is you' : ''}`}
      onPress={() => router.push(`/players/${player.id}`)}
      className="border-border min-h-14 flex-row items-center justify-between gap-3 border px-4 py-3 active:opacity-70"
    >
      <Text className="text-foreground flex-1 text-[15.5px]" numberOfLines={1}>
        {player.fullName}
      </Text>

      {/*
        "This is me" — the only way an account and a player get joined.
        Deliberately a choice rather than an assumption: most people in this
        list are opponents and team-mates, not the person holding the phone.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isMe ? `${player.fullName} is you` : `Say ${player.fullName} is you`}
        onPress={onClaim}
        hitSlop={8}
        className="h-11 shrink-0 justify-center px-2 active:opacity-60"
      >
        <Text
          className={`font-heading text-[11px] uppercase tracking-[1.2px] ${
            isMe ? 'text-steel-700' : 'text-neutral-700'
          }`}
        >
          {isMe ? '★ You' : 'This is me'}
        </Text>
      </Pressable>

      <Text className="text-steel-700 shrink-0 text-base">›</Text>
    </Pressable>
  );
}

function EmptyState({ onAdd, visible }: { onAdd: () => void; visible: boolean }) {
  if (!visible) return null;
  return (
    <View className="border-border mt-6 gap-3 border p-5">
      <Kicker>No players yet</Kicker>
      <Text className="text-foreground/75 text-[14px] leading-5">
        Add everyone who might bat or bowl. You&apos;ll pick squads from here when you create a team
        — and a name is enough to start; the rest can wait.
      </Text>
      <Button label="Add the first player" onPress={onAdd} />
    </View>
  );
}
