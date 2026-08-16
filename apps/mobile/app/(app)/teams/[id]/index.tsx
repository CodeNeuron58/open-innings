/**
 * E2 — a club's home.
 *
 * The permanent URL a club puts in a WhatsApp group description or an
 * Instagram bio. Reads the same service as `/c/[teamId]` on the web, so the
 * page someone opens from a link and the screen a member sees in the app are
 * the same page.
 *
 * The leaders are **career** figures, not club-only ones. That is on the label
 * rather than hidden, because attributing a run to a club means knowing which
 * side a player turned out for in each innings — and club cricketers turn out
 * for more than one.
 */
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { ClubPageResponse } from '@open-innings/shared';
import { api } from '../../../../lib/api';
import { shareUrls } from '../../../../lib/config';
import { useApiQuery } from '../../../../lib/use-api';
import { Button, ErrorBanner, Kicker, LoadingScreen } from '../../../../components/ui';

type Result = ClubPageResponse['results'][number];

/**
 * Won, lost, tied, or still going.
 *
 * Read off the server's own result line rather than recomputed from scores —
 * the summary is what was written when the match completed, and a second
 * implementation of "who won" is a second thing that can be wrong about a tie.
 */
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

  const query = useApiQuery<ClubPageResponse>((t, signal) => api.club(t, id, signal), [id]);

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

      <ScrollView contentContainerClassName="pb-6">
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

        {club.leaders.runs || club.leaders.wickets ? (
          <View className="px-4 pt-6">
            {/* "Career", not "this club" — see the note at the top. */}
            <Kicker>Squad leaders · career</Kicker>
            <View className="border-border mt-2 border-t">
              {club.leaders.runs ? (
                <LeaderRow
                  label="Most runs"
                  name={club.leaders.runs.name}
                  value={club.leaders.runs.value}
                  onPress={() =>
                    router.push({
                      pathname: '/players/[id]',
                      params: { id: club.leaders.runs!.playerId },
                    })
                  }
                />
              ) : null}
              {club.leaders.wickets ? (
                <LeaderRow
                  label="Most wkts"
                  name={club.leaders.wickets.name}
                  value={club.leaders.wickets.value}
                  onPress={() =>
                    router.push({
                      pathname: '/players/[id]',
                      params: { id: club.leaders.wickets!.playerId },
                    })
                  }
                />
              ) : null}
            </View>
            {/*
              The design also lists best strike rate and most catches. Both are
              per-player figures the club service does not compute — it ranks
              runs and wickets only. Adding them means two more aggregates
              across the squad; see docs/wiring.md.
            */}
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
                  onPress={() => router.push({ pathname: '/players/[id]', params: { id: p.id } })}
                  className="border-border h-9 shrink-0 justify-center border px-2.5 active:opacity-70"
                >
                  <Text className="text-foreground font-heading text-[12.5px]" numberOfLines={1}>
                    {p.fullName}
                  </Text>
                </Pressable>
              ))}
            </View>
            {/*
              The design marks the captain (c) and the keeper †. `team_members`
              has both columns; the API does not send them. Same gap as B3 —
              see docs/wiring.md.
            */}
          </View>
        ) : null}

        <View className="px-4 pt-7">
          <Button
            label="Add a player"
            variant="secondary"
            onPress={() => router.push({ pathname: '/teams/[id]/add', params: { id } })}
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
  value: number;
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
