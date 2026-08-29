/**
 * E3 — add a player to a squad.
 * Global search prioritizes existing players to maintain unified career records,
 * falling back to creation if not found.
 */
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { PlayerRole } from '@open-innings/shared';
import { api } from '../../../../lib/api';
import { useApiQuery } from '../../../../lib/use-api';
import { careerLine, usePlayerFinder } from '../../../../lib/use-player-finder';
import { Button, ErrorBanner, Field, Kicker, LoadingScreen } from '../../../../components/ui';

/**
 * The four the design offers, plus keeper-batsman — which is what most club
 * keepers actually are, and dropping it would push them into "Keeper" and lose
 * the batting half of what they do.
 */
const ROLES: { value: PlayerRole; label: string }[] = [
  { value: 'batsman', label: 'Top order' },
  { value: 'bowler', label: 'Bowler' },
  { value: 'all_rounder', label: 'All-rounder' },
  { value: 'wicket_keeper', label: 'Keeper' },
  { value: 'wicket_keeper_batsman', label: 'Keeper-bat' },
];

export default function AddPlayer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const team = useApiQuery((t, signal) => api.team(t, id, signal), [id]);

  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<PlayerRole | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const squadIds = useMemo(() => new Set((team.data?.members ?? []).map((m) => m.id)), [team.data]);

  /*
   * The search-before-create rule, shared with the match wizard.
   *
   * This screen had it and the wizard had none, because the wizard could not
   * create a player at all — it navigated here and left the draft behind. Now
   * both ask the same question and get the same answer, which matters because
   * the answer decides whether a cricketer gets a second row and a split
   * career. See lib/use-player-finder.ts.
   */
  const finder = usePlayerFinder({
    teamId: id,
    squadIds,
    onAdded: (playerId) => {
      setAdded((prev) => new Set(prev).add(playerId));
      setNewName('');
      setNewRole(null);
      void team.refresh();
    },
  });

  const { search, setSearch, matches } = finder;

  if (team.isLoading) return <LoadingScreen />;

  const { searching, noMatches } = finder;

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-row items-center px-5 pb-3 pt-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="-ml-1 mr-3 p-1 active:opacity-70"
        >
          <Text className="text-foreground text-[28px] leading-[28px]">‹</Text>
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text className="text-foreground font-heading text-[26px] uppercase" numberOfLines={1}>
            Add Player
          </Text>
          <Text className="font-heading mt-0.5 text-[10.5px] uppercase tracking-[1.4px] text-neutral-700">
            {squadIds.size} {squadIds.size === 1 ? 'player' : 'players'} in squad
          </Text>
        </View>
      </View>

      <ScrollView contentContainerClassName="px-5 pb-8" keyboardShouldPersistTaps="handled">
        {finder.error ? <ErrorBanner message={finder.error} /> : null}

        <View className="pt-1">
          <Field
            label="Search by name"
            value={search}
            onChangeText={setSearch}
            placeholder="Start typing a name"
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>
        <Text className="text-foreground/60 mt-2 px-1 text-[12.5px] leading-[18px]">
          Search first. Adding an existing player keeps their career record intact. If they
          aren&rsquo;t found, you can create a new profile for them.
        </Text>

        {searching ? (
          <View className="flex-row items-center gap-2 pt-5">
            <ActivityIndicator size="small" />
            <Text className="font-heading text-[9.5px] uppercase tracking-[1.3px] text-neutral-600">
              Searching Open Innings
            </Text>
          </View>
        ) : null}

        {matches.length > 0 ? (
          <View className="pt-5">
            <Kicker>On Open Innings</Kicker>
            <View className="border-border mt-2 border-t">
              {matches.map((p) => {
                const justAdded = added.has(p.id);
                return (
                  <View
                    key={p.id}
                    className="border-border flex-row items-center gap-3 border-b py-3"
                  >
                    <View className="min-w-0 flex-1">
                      <View className="flex-row items-center gap-1.5">
                        <Text className="text-foreground shrink text-[15px]" numberOfLines={1}>
                          {p.fullName}
                        </Text>
                        {/* A claimed player is a person who said "this is me",
                            which is the strongest signal that this is the
                            right one rather than a namesake. */}
                        {p.isClaimed ? (
                          <Text className="text-steel-700 shrink-0 text-[11px]">✓</Text>
                        ) : null}
                        {p.isMine ? (
                          <Text className="font-heading shrink-0 text-[8.5px] uppercase tracking-[1.2px] text-neutral-500">
                            yours
                          </Text>
                        ) : null}
                      </View>
                      {/* The whole reason this screen searches before it
                          offers to create: enough of a record to tell two
                          people with the same name apart. Now that the search
                          is global, that is not a nicety — a common name will
                          return several people and the club is usually what
                          settles it. */}
                      <Text
                        className="font-heading mt-0.5 text-[9px] uppercase tracking-[1.2px] text-neutral-600"
                        numberOfLines={1}
                      >
                        {[
                          p.role ? ROLES.find((r) => r.value === p.role)?.label : null,
                          careerLine(p),
                          p.clubs.length > 0 ? p.clubs.join(', ') : null,
                        ]
                          .filter(Boolean)
                          .join('  ·  ')}
                      </Text>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${p.fullName} to the squad`}
                      onPress={() => void finder.addExisting(p.id)}
                      disabled={justAdded || finder.busy}
                      className={`shrink-0 border px-3 py-2 ${
                        justAdded ? 'border-border opacity-50' : 'border-input active:opacity-70'
                      }`}
                    >
                      <Text className="text-steel-700 font-heading text-[10px] uppercase tracking-[1.3px]">
                        {justAdded ? 'Added' : 'Add'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* The fallback. Only offered once searching has actually failed —
            showing it first is what trains people to create duplicates. */}
        {noMatches ? (
          <View className="pt-6">
            <View className="border-border border-t pt-4">
              <Kicker>Not found? Create a local player</Kicker>
            </View>

            <View className="pt-3">
              <Field
                label="Name"
                value={newName || search}
                onChangeText={setNewName}
                placeholder="Full name"
                autoCapitalize="words"
              />
            </View>

            <View className="pt-3">
              <Text className="font-heading text-[9.5px] uppercase tracking-[1.5px] text-neutral-600">
                Role
              </Text>
              <View className="mt-2 flex-row flex-wrap gap-1.5">
                {ROLES.map((r) => (
                  <Pressable
                    key={r.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: newRole === r.value }}
                    onPress={() => setNewRole(newRole === r.value ? null : r.value)}
                    className={`h-10 shrink-0 justify-center border px-3 ${
                      newRole === r.value ? 'bg-scoreboard border-scoreboard' : 'border-input'
                    } active:opacity-70`}
                  >
                    <Text
                      className={`font-heading text-[12.5px] ${
                        newRole === r.value ? 'text-scoreboard-text' : 'text-foreground'
                      }`}
                    >
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/*
              The design offers "Invite by number so he claims his own career
              page later" — the mechanism by which a local player becomes a
              real account. It needs phone auth, which does not exist, and a
              claim flow, which does not either. Not drawn. See docs/wiring.md.
            */}

            <View className="pt-4">
              <Button
                label="Add to squad"
                loading={finder.busy}
                disabled={(newName || search).trim().length === 0}
                onPress={() => void finder.createAndAdd(newName || search, newRole)}
              />
            </View>
          </View>
        ) : null}

        {finder.truncated ? (
          <Text className="text-foreground/60 pt-3 text-[12px] leading-[17px]">
            More than ten people match that. Add a surname or an initial to narrow it.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
