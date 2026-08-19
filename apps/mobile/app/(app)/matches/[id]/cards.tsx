/**
 * D4 — player cards.
 * Individual player share cards generated from the match.
 */
import { useState } from 'react';
import { Image, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { MatchCardResponse } from '@open-innings/shared';
import { api } from '../../../../lib/api';
import { CARD_ASPECT_RATIO, shareUrls } from '../../../../lib/config';
import { usePublicQuery } from '../../../../lib/use-api';
import { AdBar } from '../../../../components/AdBar';
import { MatchTabs } from '../../../../components/MatchTabs';
import { Button, ErrorBanner, Kicker, LoadingScreen } from '../../../../components/ui';

type Entry = { playerId: string; name: string; line: string };

export default function PlayerCards() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);

  const query = usePublicQuery<MatchCardResponse>(
    (t, signal) => api.matchCard(t, id, signal),
    [id],
  );

  if (query.isLoading) return <LoadingScreen />;

  if (query.error || !query.data) {
    return (
      <SafeAreaView className="bg-background flex-1 justify-center p-6">
        <Stack.Screen options={{ headerShown: false }} />
        <ErrorBanner message={query.error ?? 'Could not load the players.'} />
        <View className="mt-4">
          <Button label="Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  // Build entries for players who batted or bowled in either innings.
  const byPlayer = new Map<string, { name: string; bat?: string; bowl?: string }>();
  for (const inn of query.data.innings) {
    for (const b of inn.batting) {
      if (b.balls === 0 && !b.isOut) continue;
      const e = byPlayer.get(b.playerId) ?? { name: b.playerName };
      e.bat = `${b.runs}${b.isOut ? '' : '*'}(${b.balls})`;
      byPlayer.set(b.playerId, e);
    }
    for (const b of inn.bowling) {
      const e = byPlayer.get(b.playerId) ?? { name: b.playerName };
      if (b.wickets > 0 || b.runs > 0) e.bowl = `${b.wickets}/${b.runs}`;
      byPlayer.set(b.playerId, e);
    }
  }

  const entries: Entry[] = [...byPlayer.entries()]
    .map(([playerId, e]) => ({
      playerId,
      name: e.name,
      line: [e.bat, e.bowl].filter(Boolean).join(' & ') || 'Played',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const active = entries.find((e) => e.playerId === selected) ?? entries[0];

  async function send(entry: Entry) {
    await Share.share({
      message: `${entry.name} — ${entry.line}\n${shareUrls.playerInMatch(id, entry.playerId)}`,
    });
  }

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-row items-center gap-2 px-3 pb-1 pt-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-9 w-8 items-center justify-center active:opacity-60"
        >
          <Text className="text-foreground/70 text-xl">‹</Text>
        </Pressable>
        <Text className="text-foreground font-heading min-w-0 flex-1 text-[19px]">
          Player cards
        </Text>
        <Text className="font-heading shrink-0 text-[9px] uppercase tracking-[1.3px] text-neutral-500">
          {entries.length} from this match
        </Text>
      </View>

      <Text className="text-foreground/60 px-4 pb-3 text-[12.5px] leading-[18px]">
        One per player, both sides. Send someone their own card rather than the whole scorecard.
      </Text>

      {entries.length === 0 || !active ? (
        <View className="flex-1 px-4">
          <View className="border-border border p-4">
            <Text className="text-foreground/70 text-[13.5px] leading-5">
              Nobody has batted or bowled yet, so there are no cards to send. They appear as the
              match is scored.
            </Text>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerClassName="px-4 pb-4">
          <View className="border-border border">
            <Image
              // Keyed by player to force image swap on selection.
              key={active.playerId}
              source={{ uri: shareUrls.playerCardImage(id, active.playerId) }}
              style={{ width: '100%', aspectRatio: CARD_ASPECT_RATIO }}
              resizeMode="contain"
              accessibilityLabel={`Card for ${active.name}, ${active.line}`}
            />
          </View>

          <View className="mt-3">
            <Button label={`Send ${active.name}'s card`} onPress={() => void send(active)} />
          </View>

          <View className="border-border mt-5 border-t pt-3">
            <Kicker>Other cards</Kicker>
          </View>

          <View className="mt-2 flex-row flex-wrap gap-1.5">
            {entries.map((e) => {
              const isActive = e.playerId === active.playerId;
              return (
                <Pressable
                  key={e.playerId}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${e.name}, ${e.line}`}
                  onPress={() => setSelected(e.playerId)}
                  className={`min-w-[92px] border p-2 ${
                    isActive ? 'bg-scoreboard border-scoreboard' : 'border-border'
                  } active:opacity-70`}
                >
                  <Text
                    className={`font-heading text-[15px] ${
                      isActive ? 'text-scoreboard-text' : 'text-foreground'
                    }`}
                    numberOfLines={1}
                  >
                    {e.line}
                  </Text>
                  <Text
                    className={`font-heading mt-0.5 text-[8.5px] uppercase tracking-[1.2px] ${
                      isActive ? 'text-scoreboard-muted' : 'text-neutral-600'
                    }`}
                    numberOfLines={1}
                  >
                    {e.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* "Save all 22" omitted due to missing expo-media-library support. */}
        </ScrollView>
      )}

      <AdBar />
      <MatchTabs matchId={id} active="card" />
    </SafeAreaView>
  );
}
