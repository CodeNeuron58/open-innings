/**
 * E3 — add a player to a squad.
 * Global search prioritizes existing players to maintain unified career records,
 * falling back to creation if not found.
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { PlayerRole, PlayerSearchResult } from '@open-innings/shared';
import { api } from '../../../../lib/api';
import { useApiQuery, useApiMutation } from '../../../../lib/use-api';
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

/** The server refuses anything shorter, so there is no point asking. */
const MIN_QUERY = 2;

/**
 * A career in one line, from what the search already returned.
 *
 * Deliberately not a second request. The old screen fetched briefs for
 * whatever was on screen; the search now carries the same figures, so the
 * round trip is gone rather than moved.
 */
function careerLine(p: PlayerSearchResult): string {
  const parts: string[] = [];
  if (p.matches > 0) parts.push(`${p.matches} ${p.matches === 1 ? 'match' : 'matches'}`);
  if (p.runs > 0) parts.push(`${p.runs} runs`);
  if (p.wickets > 0) parts.push(`${p.wickets} wkts`);
  if (parts.length === 0) return 'No matches yet';
  return parts.join('  ·  ');
}

export default function AddPlayer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const team = useApiQuery((t, signal) => api.team(t, id, signal), [id]);
  const mutation = useApiMutation();

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<PlayerRole | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  /*
   * Debounced, because this now leaves the phone.
   *
   * Typing a name is six or seven keystrokes and each one used to filter an
   * array. Firing a request per keystroke on ground-side mobile data would
   * make the screen feel worse than the version that could not find anybody.
   */
  useEffect(() => {
    const trimmed = search.trim();
    const timer = setTimeout(() => setQuery(trimmed), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const results = useApiQuery(
    (t, signal) =>
      query.length >= MIN_QUERY
        ? api.searchPlayers(t, query, { scope: 'all', limit: 10, signal })
        : Promise.resolve({ players: [], scope: 'all' as const, truncated: false }),
    [query],
  );

  const squadIds = useMemo(() => new Set((team.data?.members ?? []).map((m) => m.id)), [team.data]);

  // Somebody already in this squad is not a search result, they are the
  // answer to a question nobody asked.
  const matches = useMemo(
    () => (results.data?.players ?? []).filter((p) => !squadIds.has(p.id)),
    [results.data, squadIds],
  );

  if (team.isLoading) return <LoadingScreen />;

  async function addExisting(player: PlayerSearchResult) {
    const result = await mutation.run((t) => api.addTeamMember(t, id, player.id));
    if (result !== null) {
      setAdded((prev) => new Set(prev).add(player.id));
      await team.refresh();
    }
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (name.length === 0) return;

    const created = await mutation.run((t) =>
      api.createPlayer(t, { fullName: name, ...(newRole ? { role: newRole } : {}) }),
    );
    if (!created) return;

    const result = await mutation.run((t) => api.addTeamMember(t, id, created.player.id));
    if (result !== null) {
      setNewName('');
      setNewRole(null);
      setSearch('');
      await team.refresh();
    }
  }

  const searching = query.length >= MIN_QUERY && results.isLoading;
  // "Nothing found" only once the server has actually answered. Offering to
  // create while a request is still out is how duplicates get made.
  const noMatches = query.length >= MIN_QUERY && !searching && matches.length === 0;

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-row items-center gap-2 px-3 pb-2 pt-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-9 w-8 items-center justify-center active:opacity-60"
        >
          <Text className="text-foreground/70 text-xl">‹</Text>
        </Pressable>
        <Text className="text-foreground font-heading min-w-0 flex-1 text-[21px]" numberOfLines={1}>
          Add a player
        </Text>
        <Text className="font-heading shrink-0 text-[9px] uppercase tracking-[1.3px] text-neutral-500">
          {squadIds.size} in squad
        </Text>
      </View>

      <ScrollView contentContainerClassName="px-4 pb-6" keyboardShouldPersistTaps="handled">
        {mutation.error ? <ErrorBanner message={mutation.error} /> : null}

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
        <Text className="text-foreground/60 mt-1.5 text-[12px] leading-[17px]">
          Players already on Open Innings keep their career when you add them.
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
                      onPress={() => void addExisting(p)}
                      disabled={justAdded || mutation.busy}
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
                loading={mutation.busy}
                disabled={(newName || search).trim().length === 0}
                onPress={() => void createAndAdd()}
              />
            </View>
          </View>
        ) : null}

        {results.data?.truncated ? (
          <Text className="text-foreground/60 pt-3 text-[12px] leading-[17px]">
            More than ten people match that. Add a surname or an initial to narrow it.
          </Text>
        ) : null}

        {search.trim().length === 0 ? (
          <View className="border-border mt-6 border p-4">
            <Text className="text-foreground/70 text-[13.5px] leading-5">
              Search first. If someone has played a scored match anywhere on Open Innings, adding
              them here brings their whole record with them rather than starting a second one.
            </Text>
          </View>
        ) : null}

        {team.data && team.data.members.length > 0 ? (
          <View className="pt-7">
            <Kicker>Squad · {team.data.members.length}</Kicker>
            <View className="mt-2.5 flex-row flex-wrap gap-1.5">
              {team.data.members.map((m) => (
                <View
                  key={m.id}
                  className="border-border h-9 shrink-0 justify-center border px-2.5"
                >
                  <Text className="text-foreground font-heading text-[12.5px]" numberOfLines={1}>
                    {m.fullName}
                    {m.isCaptain ? <Text className="text-steel-700"> (c)</Text> : null}
                    {m.isWicketkeeper ? <Text className="text-steel-700"> †</Text> : null}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
