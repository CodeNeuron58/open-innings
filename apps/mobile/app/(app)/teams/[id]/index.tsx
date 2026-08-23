/**
 * E2 — a club's home.
 * Shows club details, recent results, and career figures for squad members.
 */
import { Alert, Pressable, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { ClubLeaderView, ClubPageResponse, TeamListResponse } from '@open-innings/shared';
import { api } from '../../../../lib/api';
import { shareUrls } from '../../../../lib/config';
import { useRequireAccount } from '../../../../lib/guest';
import { usePublicQuery, useApiQuery, useApiMutation } from '../../../../lib/use-api';
import { Button, ErrorBanner, Kicker, LoadingScreen } from '../../../../components/ui';

type Result = ClubPageResponse['results'][number];

/** Derives outcome (W/L/T/·) from the server's summary line. */
function outcomeFor(r: Result, clubName: string): { mark: string; tone: string } {
  if (r.status !== 'completed' || !r.summary) return { mark: '·', tone: 'text-foreground/40' };
  if (r.summary.toLowerCase().startsWith(clubName.toLowerCase()))
    return { mark: 'W', tone: 'text-steel-700' };
  if (/\btied?\b/i.test(r.summary)) return { mark: 'T', tone: 'text-foreground/60' };
  return { mark: 'L', tone: 'text-foreground/60' };
}

export default function ClubPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const requireAccount = useRequireAccount();

  const query = usePublicQuery<ClubPageResponse>((t, signal) => api.club(t, id, signal), [id]);

  // Ownership checked via teams list. Required to edit squad roles.
  const myTeams = useApiQuery<TeamListResponse>((t, signal) => api.teams(t, signal), []);
  const isOwner = myTeams.data?.teams.some((t) => t.id === id) ?? false;
  const mutation = useApiMutation();

  /** Updates squad-specific roles (captain/keeper). */
  function editRole(player: {
    id: string;
    fullName: string;
    isCaptain: boolean;
    isWicketkeeper: boolean;
  }) {
    const set = async (patch: { isCaptain?: boolean; isWicketkeeper?: boolean }) => {
      const done = await mutation.run((t) =>
        api.updateTeamMember(t, id, { playerId: player.id, ...patch }),
      );
      if (done) await query.refresh();
    };

    Alert.alert(player.fullName, 'Who is this in the squad?', [
      {
        text: player.isCaptain ? 'Not captain' : 'Make captain',
        onPress: () => void set({ isCaptain: !player.isCaptain }),
      },
      {
        text: player.isWicketkeeper ? 'Not wicketkeeper' : 'Make wicketkeeper',
        onPress: () => void set({ isWicketkeeper: !player.isWicketkeeper }),
      },
      {
        text: 'Open career',
        onPress: () => router.push({ pathname: '/players/[id]', params: { id: player.id } }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  if (query.isLoading) return <LoadingScreen />;

  if (query.error || !query.data) {
    return (
      <SafeAreaView className="bg-background flex-1 justify-center p-6">
        <Stack.Screen options={{ headerShown: false }} />
        <ErrorBanner message={query.error ?? 'Could not load this club.'} />
        <View className="mt-4">
          <Button label="Back" variant="secondary" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const club = query.data;
  const completed = club.results.filter((r) => r.status === 'completed');
  const outcomes = completed.map((r) => outcomeFor(r, club.team.name));
  const won = outcomes.filter((o) => o.mark === 'W').length;
  const lost = outcomes.filter((o) => o.mark === 'L').length;
  const tied = outcomes.filter((o) => o.mark === 'T').length;

  /*
   * The four the design lists, in the order it lists them, minus any nobody
   * qualifies for. Strike rate has a minimum balls-faced floor on the server,
   * so a club whose season is two matches old will not have one yet.
   */
  const leaderRows: { label: string; leader: ClubLeaderView }[] = [
    { label: 'Most runs', leader: club.leaders.runs },
    { label: 'Most wkts', leader: club.leaders.wickets },
    { label: 'Best SR', leader: club.leaders.strikeRate },
    { label: 'Catches', leader: club.leaders.catches },
  ].flatMap((row) => (row.leader ? [{ label: row.label, leader: row.leader }] : []));

  async function share() {
    // The club's public page lives on the web — that is the link worth
    // sending, not a deep link only people who already have the app can open.
    await Share.share({
      message: `${club.team.name} — ${completed.length} played, ${won} won\n${shareUrls.club(id)}`,
    });
  }

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
          {club.team.name}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share this club"
          onPress={() => void share()}
          className="shrink-0 px-1 py-1 active:opacity-60"
        >
          <Text className="text-steel-700 font-heading text-[9.5px] uppercase tracking-[1.3px]">
            Share club
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerClassName="pb-6"
        refreshControl={
          <RefreshControl refreshing={query.isRefreshing} onRefresh={query.refresh} />
        }
      >
        {/* Played / won / lost / tied, on one drawn grid. */}
        <View className="mx-4 flex-row border-l border-t border-neutral-300">
          {[
            { v: completed.length, l: 'Played' },
            { v: won, l: 'Won' },
            { v: lost, l: 'Lost' },
            { v: tied, l: 'Tied' },
          ].map((s) => (
            <View key={s.l} className="w-1/4 border-b border-r border-neutral-300 px-3 py-3">
              <Text className="text-foreground font-heading text-[22px] leading-[24px]">{s.v}</Text>
              <Text className="font-heading mt-0.5 text-[8.5px] uppercase tracking-[1.2px] text-neutral-600">
                {s.l}
              </Text>
            </View>
          ))}
        </View>

        {leaderRows.length > 0 ? (
          <View className="px-4 pt-6">
            {/* "Career", not "this club" — see the note at the top. */}
            <Kicker>Squad leaders · career</Kicker>
            <View className="border-border mt-2 border-t">
              {leaderRows.map((row) => (
                <LeaderRow
                  key={row.label}
                  label={row.label}
                  name={row.leader.name}
                  value={String(row.leader.value)}
                  onPress={() =>
                    router.push({ pathname: '/players/[id]', params: { id: row.leader.playerId } })
                  }
                />
              ))}
            </View>
          </View>
        ) : null}

        {club.results.length > 0 ? (
          <View className="px-4 pt-6">
            <Kicker>Recent results</Kicker>
            <View className="border-border mt-2 border-t">
              {club.results.slice(0, 8).map((r) => {
                const o = outcomeFor(r, club.team.name);
                return (
                  <Pressable
                    key={r.matchId}
                    accessibilityRole="button"
                    accessibilityLabel={`${r.opponent ?? 'Match'} — ${r.summary ?? 'in progress'}`}
                    onPress={() =>
                      router.push({ pathname: '/matches/[id]/card', params: { id: r.matchId } })
                    }
                    className="border-border flex-row items-center gap-3 border-b py-2.5 active:opacity-70"
                  >
                    <Text className={`font-heading w-4 shrink-0 text-[13px] ${o.tone}`}>
                      {o.mark}
                    </Text>
                    <Text className="text-foreground min-w-0 flex-1 text-[14px]" numberOfLines={1}>
                      v {r.opponent ?? 'Unknown'}
                    </Text>
                    <Text
                      className="text-foreground/55 shrink-0 text-right text-[11.5px]"
                      numberOfLines={1}
                    >
                      {r.status === 'completed' ? marginOf(r.summary) : 'in progress'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {club.squad.length > 0 ? (
          <View className="px-4 pt-6">
            <Kicker>Squad · {club.squad.length}</Kicker>
            <View className="mt-2.5 flex-row flex-wrap gap-1.5">
              {club.squad.map((p) => (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.fullName}'s career`}
                  accessibilityHint={isOwner ? 'Hold to set captain or wicketkeeper' : undefined}
                  onPress={() => router.push({ pathname: '/players/[id]', params: { id: p.id } })}
                  // Held rather than tapped: reading a career is what everyone
                  // opening a club page came for, and naming a captain is
                  // something the owner does once a season.
                  onLongPress={isOwner ? () => editRole(p) : undefined}
                  className="border-border h-9 shrink-0 justify-center border px-2.5 active:opacity-70"
                >
                  <Text className="text-foreground font-heading text-[12.5px]" numberOfLines={1}>
                    {p.fullName}
                    {/* The conventional marks: (c) for the captain, † for the
                        keeper. A player can be both. */}
                    {p.isCaptain ? <Text className="text-steel-700"> (c)</Text> : null}
                    {p.isWicketkeeper ? <Text className="text-steel-700"> †</Text> : null}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View className="px-4 pt-7">
          <Button
            label="Add a player"
            variant="secondary"
            onPress={() =>
              requireAccount('add a player', () =>
                router.push({ pathname: '/teams/[id]/add', params: { id } }),
              )
            }
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** "won by 4 wickets" out of "Koramangala XI won by 4 wickets". */
function marginOf(summary: string | null): string {
  if (!summary) return '';
  const match = /\b(won|tied|lost)\b.*$/i.exec(summary);
  return match ? match[0] : summary;
}

function LeaderRow({
  label,
  name,
  value,
  onPress,
}: {
  label: string;
  name: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${name}, ${value}`}
      onPress={onPress}
      className="border-border flex-row items-center gap-3 border-b py-2.5 active:opacity-70"
    >
      <Text className="font-heading w-[68px] shrink-0 text-[8.5px] uppercase tracking-[1.2px] text-neutral-600">
        {label}
      </Text>
      <Text className="text-foreground min-w-0 flex-1 text-[14px]" numberOfLines={1}>
        {name}
      </Text>
      <Text className="text-foreground font-heading shrink-0 text-[15px]">{value}</Text>
    </Pressable>
  );
}
