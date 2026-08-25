/**
 * Teams and squads.
 * Teams are created with their squad in a single step.
 */
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import {
  createPlayerSchema,
  createTeamSchema,
  type PlayerSummary,
  type TeamSummary,
} from '@open-innings/shared';
import { api } from '../../../lib/api';
import { useApiQuery, useApiMutation } from '../../../lib/use-api';
import { Button, ErrorBanner, Field, Kicker, LoadingScreen } from '../../../components/ui';

export default function Teams() {
  const router = useRouter();

  const teams = useApiQuery((token, signal) => api.teams(token, signal));
  const players = useApiQuery((token, signal) => api.players(token, signal));
  const mutation = useApiMutation();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [squad, setSquad] = useState<Set<string>>(new Set());

  // The inline add — see the note beside the field.
  const [newPlayer, setNewPlayer] = useState('');
  const [playerError, setPlayerError] = useState<string | null>(null);

  /** Create a player and put them straight in the squad being picked. */
  async function addPlayer() {
    setPlayerError(null);
    const parsed = createPlayerSchema.safeParse({ fullName: newPlayer });
    if (!parsed.success) {
      setPlayerError(parsed.error.issues[0]?.message ?? 'Enter a name');
      return;
    }

    const created = await mutation.run((token) => api.createPlayer(token, parsed.data));
    if (!created) return;

    setNewPlayer('');
    // Selected on creation: somebody typed into a squad picker, so putting
    // them in the squad is the only reading of what they meant.
    setSquad((current) => new Set(current).add(created.player.id));
    await players.refresh();
  }

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
          <Text className="text-foreground font-heading text-[26px] uppercase">Teams</Text>
          <Text className="font-heading text-[10.5px] uppercase tracking-[1.4px] text-neutral-700">
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
        <View className="border-border mx-5 mb-3 gap-3 border p-4">
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
            <Text className="font-heading text-[11px] uppercase tracking-[1.6px] text-neutral-700">
              Squad — {squad.size} selected
            </Text>
            {allPlayers.length > 0 ? (
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
            ) : null}

            {/*
              Adding a player without leaving.

              This used to read "No players yet — add some first, then come
              back", which is a screen instructing somebody to navigate away and
              return. It was the second of three dead ends between installing
              the app and scoring a ball: Matches sent you to Teams, Teams sent
              you to Players, and each was discovered by walking into it.

              A name is enough. Batting style, bowling style and role are all
              optional on `createPlayerSchema` and can be filled in later from
              the player's own page — asking for them at the ground, ten minutes
              before a start, is asking for the app to be closed.
            */}
            <View className="mt-1 flex-row items-end gap-2">
              <View className="min-w-0 flex-1">
                <Field
                  label="Add a player"
                  value={newPlayer}
                  onChangeText={setNewPlayer}
                  error={playerError ?? undefined}
                  placeholder="Name, then Add"
                  autoCapitalize="words"
                  editable={!mutation.busy}
                  onSubmitEditing={() => void addPlayer()}
                  returnKeyType="done"
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add this player to the squad"
                onPress={() => void addPlayer()}
                disabled={mutation.busy || newPlayer.trim().length === 0}
                className={`border-input h-12 shrink-0 justify-center border px-4 ${
                  mutation.busy || newPlayer.trim().length === 0
                    ? 'opacity-40'
                    : 'active:opacity-70'
                }`}
              >
                <Text className="text-foreground font-heading text-[13.5px] uppercase tracking-[1.2px]">
                  Add
                </Text>
              </Pressable>
            </View>
          </View>

          <Button
            label="Create team"
            onPress={createTeam}
            loading={mutation.busy}
            disabled={name.trim().length === 0}
          />
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
            <View className="border-border mt-6 gap-3 border p-5">
              <Kicker>No teams yet</Kicker>
              <Text className="text-foreground/75 text-[14px] leading-5">
                A match is between two of them. Name a team and add whoever turned out — you can do
                both here, and they stay on the club&apos;s books for next time.
              </Text>
              <Button label="Create a team" onPress={() => setCreating(true)} />
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
      className={`h-11 shrink-0 justify-center border px-3 ${
        selected ? 'bg-primary border-primary' : 'border-border bg-transparent'
      } active:opacity-70`}
    >
      <Text
        className={`font-heading text-[13.5px] ${
          selected ? 'text-primary-foreground' : 'text-foreground'
        }`}
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
