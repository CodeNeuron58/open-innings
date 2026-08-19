/**
 * Teams and squads.
 * Teams are created with their squad in a single step.
 */
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { createTeamSchema, type PlayerSummary, type TeamSummary } from '@open-innings/shared';
import { api } from '../../../lib/api';
import { useApiQuery, useApiMutation } from '../../../lib/use-api';
import { Button, ErrorBanner, Field, LoadingScreen } from '../../../components/ui';

export default function Teams() {
  const router = useRouter();

  const teams = useApiQuery((token, signal) => api.teams(token, signal));
  const players = useApiQuery((token, signal) => api.players(token, signal));
  const mutation = useApiMutation();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [squad, setSquad] = useState<Set<string>>(new Set());

  function toggle(playerId: string) {
    setSquad((current) => {
      const next = new Set(current);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  async function createTeam() {
    setNameError(null);
    const parsed = createTeamSchema.safeParse({ name });
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? 'Enter a team name');
      return;
    }

    const result = await mutation.run((token) =>
      api.createTeam(token, { ...parsed.data, playerIds: [...squad] }),
    );

    if (result) {
      setName('');
      setSquad(new Set());
      setCreating(false);
      await teams.refresh();
    }
  }

  if (teams.isLoading || players.isLoading) return <LoadingScreen />;

  const allPlayers = players.data?.players ?? [];
  const teamList = teams.data?.teams ?? [];

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ title: 'Teams' }} />

      <View className="flex-row items-center justify-between px-5 pb-3 pt-4">
        <View>
          <Text className="text-foreground text-2xl font-bold">Teams</Text>
          <Text className="text-muted-foreground text-sm">
            {teamList.length} {teamList.length === 1 ? 'team' : 'teams'}
          </Text>
        </View>
        <Button
          label={creating ? 'Cancel' : 'New team'}
          variant={creating ? 'ghost' : 'primary'}
          onPress={() => setCreating((v) => !v)}
        />
      </View>

      {teams.error || mutation.error ? (
        <View className="px-5 pb-3">
          <ErrorBanner message={teams.error ?? mutation.error ?? ''} />
        </View>
      ) : null}

      {creating ? (
        <View className="border-border bg-card mx-5 mb-3 gap-3 rounded-2xl border p-4">
          <Field
            label="Team name"
            value={name}
            onChangeText={setName}
            error={nameError ?? mutation.fieldError?.message}
            placeholder="e.g. Belonia Strikers"
            autoCapitalize="words"
            autoFocus
            editable={!mutation.busy}
          />

          <View className="gap-2">
            <Text className="text-foreground text-sm font-medium">
              Squad ({squad.size} selected)
            </Text>
            {allPlayers.length === 0 ? (
              <Text className="text-muted-foreground text-sm">
                No players yet — add some first, then come back.
              </Text>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {allPlayers.map((player) => (
                  <SquadChip
                    key={player.id}
                    player={player}
                    selected={squad.has(player.id)}
                    onPress={() => toggle(player.id)}
                  />
                ))}
              </View>
            )}
          </View>

          <Button label="Create team" onPress={createTeam} loading={mutation.busy} />
        </View>
      ) : null}

      <FlatList
        data={teamList}
        keyExtractor={(t) => t.id}
        contentContainerClassName="px-5 pb-8 gap-2"
        refreshControl={
          <RefreshControl refreshing={teams.isRefreshing} onRefresh={teams.refresh} />
        }
        ListEmptyComponent={
          creating || teams.error ? null : (
            <View className="border-border bg-card mt-6 gap-3 rounded-2xl border p-6">
              <Text className="text-foreground text-base font-semibold">No teams yet</Text>
              <Text className="text-muted-foreground text-sm">
                You need two teams with squads before you can start a match.
              </Text>
              {allPlayers.length === 0 ? (
                <Button label="Add players first" onPress={() => router.push('/players')} />
              ) : (
                <Button label="Create a team" onPress={() => setCreating(true)} />
              )}
            </View>
          )
        }
        renderItem={({ item }) => (
          <TeamRow
            team={item}
            onPress={() => router.push({ pathname: '/teams/[id]', params: { id: item.id } })}
          />
        )}
      />

      <View className="border-border flex-row gap-3 border-t px-5 py-3">
        <View className="flex-1">
          <Button label="Players" variant="secondary" onPress={() => router.push('/players')} />
        </View>
        <View className="flex-1">
          <Button label="Back" variant="ghost" onPress={() => router.back()} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function SquadChip({
  player,
  selected,
  onPress,
}: {
  player: PlayerSummary;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className={`shrink-0 rounded-full border px-3 py-2 ${
        selected ? 'bg-primary border-primary' : 'border-border bg-card'
      }`}
    >
      <Text
        className={`text-sm ${selected ? 'text-primary-foreground font-semibold' : 'text-foreground'}`}
      >
        {player.shortName ?? player.fullName}
      </Text>
    </Pressable>
  );
}

function TeamRow({ team, onPress }: { team: TeamSummary; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${team.name} club page`}
      onPress={onPress}
      className="border-border flex-row items-center gap-3 border px-4 py-3 active:opacity-70"
    >
      <View className="min-w-0 flex-1">
        <Text className="text-foreground font-heading text-[16px]" numberOfLines={1}>
          {team.name}
        </Text>
        {team.homeGround ? (
          <Text className="text-foreground/55 mt-0.5 text-[12px]" numberOfLines={1}>
            {team.homeGround}
          </Text>
        ) : null}
      </View>
      <Text className="text-foreground/35 shrink-0 text-[17px]">›</Text>
    </Pressable>
  );
}
