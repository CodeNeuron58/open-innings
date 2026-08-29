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
function outcomeFor(r: Result, clubName: string): { mark: string; bg: string; text: string } {
  if (r.status !== 'completed' || !r.summary)
    return { mark: '-', bg: 'bg-neutral-200', text: 'text-neutral-600' };
  if (r.summary.toLowerCase().startsWith(clubName.toLowerCase()))
    return { mark: 'W', bg: 'bg-primary', text: 'text-primary-foreground' };
  if (/\btied?\b/i.test(r.summary))
    return { mark: 'T', bg: 'bg-neutral-300', text: 'text-neutral-800' };
  return { mark: 'L', bg: 'bg-neutral-700', text: 'text-background' };
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
  /*
   * Its own mutation, not the one squad roles use. The refusal this can return
   * is a paragraph explaining that the club has played and cannot go — it
   * belongs beside the button that asked, not in a banner shared with a
   * captaincy toggle at the other end of the screen.
   */
  const deleting = useApiMutation();

  function confirmDeleteTeam() {
    const name = query.data?.team.name ?? 'this club';
    Alert.alert(
      `Delete ${name}?`,
      'The club goes, and its squad list with it. The players themselves stay, along with everything they have ever scored. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const done = await deleting.run((t) => api.deleteTeam(t, id));
              // Only leave once it is actually gone. A refusal keeps you here,
              // where the reason is.
              if (done) router.replace('/teams');
            })();
          },
        },
      ],
    );
  }

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
            {club.team.name}
          </Text>
          <Text className="font-heading mt-0.5 text-[10.5px] uppercase tracking-[1.4px] text-neutral-700">
            {club.squad.length} {club.squad.length === 1 ? 'player' : 'players'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share this club"
          onPress={() => void share()}
          className="border-border ml-2 h-10 items-center justify-center border px-4 active:opacity-60"
        >
          <Text className="text-foreground font-heading text-[12px] uppercase tracking-[1.2px]">
            Share
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerClassName="pb-6"
        refreshControl={
          <RefreshControl refreshing={query.isRefreshing} onRefresh={query.refresh} />
        }
      >
        {/* Played / won / lost / tied */}
        <View className="border-border flex-row items-center justify-between border-b px-8 py-5">
          {[
            { v: completed.length, l: 'Played' },
            { v: won, l: 'Won' },
            { v: lost, l: 'Lost' },
            { v: tied, l: 'Tied' },
          ].map((s) => (
            <View key={s.l} className="items-center justify-center">
              <Text className="text-foreground font-heading text-[28px]">{s.v}</Text>
              <Text className="font-heading mt-1 text-[10px] uppercase tracking-[1.4px] text-neutral-500">
                {s.l}
              </Text>
            </View>
          ))}
        </View>

        {leaderRows.length > 0 ? (
          <View className="pt-6">
            <View className="px-5">
              {/* "Career", not "this club" — see the note at the top. */}
              <Kicker>Squad leaders · career</Kicker>
            </View>
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
          <View className="pt-6">
            <View className="px-5">
              <Kicker>Recent results</Kicker>
            </View>
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
                    className="border-border flex-row items-center gap-3 border-b px-5 py-3.5 active:opacity-60"
                  >
                    <View className={`h-5 w-5 shrink-0 items-center justify-center ${o.bg}`}>
                      <Text
                        className={`font-heading pt-[2px] text-[11px] leading-[11px] ${o.text}`}
                      >
                        {o.mark}
                      </Text>
                    </View>
                    <Text className="text-foreground min-w-0 flex-1 text-[15px]" numberOfLines={1}>
                      v {r.opponent ?? 'Unknown'}
                    </Text>
                    {r.status === 'completed' ? (
                      <Text className="text-foreground/55 shrink-0 text-right text-[12.5px]">
                        {marginOf(r.summary)}
                      </Text>
                    ) : (
                      <Text className="text-primary font-heading shrink-0 text-right text-[10.5px] uppercase tracking-[1.4px]">
                        In progress
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View className="pt-6">
          <View className="px-5">
            <Kicker>Squad · {club.squad.length}</Kicker>
          </View>
          <View className="border-border mt-2 border-t">
            {club.squad.map((p, i) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={`${p.fullName}'s career`}
                accessibilityHint={isOwner ? 'Hold to set captain or wicketkeeper' : undefined}
                onPress={() => router.push({ pathname: '/players/[id]', params: { id: p.id } })}
                onLongPress={isOwner ? () => editRole(p) : undefined}
                className="border-border flex-row items-center gap-3 border-b px-5 py-3.5 active:opacity-60"
              >
                <Text className="text-foreground/40 font-heading w-5 shrink-0 text-[13px]">
                  {i + 1}
                </Text>
                <View className="min-w-0 flex-1">
                  <Text className="text-foreground text-[16px]" numberOfLines={1}>
                    {p.fullName}
                    {p.isCaptain ? <Text className="text-primary"> (c)</Text> : null}
                    {p.isWicketkeeper ? <Text className="text-primary"> †</Text> : null}
                  </Text>
                </View>
                <Text className="text-foreground/30 shrink-0 text-[18px]">›</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                requireAccount('add a player', () =>
                  router.push({ pathname: '/teams/[id]/add', params: { id } }),
                )
              }
              className="border-input flex-row items-center justify-center border-b border-dashed py-4 active:opacity-60"
            >
              <Text className="text-steel-700 font-heading text-[12.5px] uppercase tracking-[1.3px]">
                + Add a player
              </Text>
            </Pressable>
          </View>
        </View>

        {/*
          At the very bottom, and only for the owner.

          A club with fixtures cannot be deleted — the server refuses, because
          a match names two sides and removing one takes the fixture's meaning
          with it. So this is mostly for a club created by mistake, which is
          exactly the case that had no way out before.
        */}
        {isOwner ? (
          <View className="border-border mt-8 border-t px-5 pt-5">
            <Button
              label="Delete club"
              variant="destructive"
              disabled={deleting.busy}
              onPress={confirmDeleteTeam}
            />
            <Text className="text-foreground/55 mt-2 font-sans text-[12.5px] leading-[18px]">
              Only possible for a club that has never played. Its squad memberships go with it; the
              players themselves stay.
            </Text>
            {deleting.error ? (
              <View className="mt-3">
                <ErrorBanner message={deleting.error} />
              </View>
            ) : null}
          </View>
        ) : null}
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
      className="border-border flex-row items-center gap-3 border-b px-5 py-3.5 active:opacity-60"
    >
      <Text className="font-heading w-[68px] shrink-0 text-[9.5px] uppercase tracking-[1.2px] text-neutral-600">
        {label}
      </Text>
      <Text className="text-foreground min-w-0 flex-1 text-[15px]" numberOfLines={1}>
        {name}
      </Text>
      <Text className="text-foreground font-heading shrink-0 text-[17px]">{value}</Text>
    </Pressable>
  );
}
