/**
 * D1 + D2 — the card.
 * Fetches /card once for both scorecard and over-by-over tabs.
 */
import { useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { CardInnings, MatchCardResponse } from '@open-innings/shared';
import { api } from '../../../../lib/api';
import { shareUrls } from '../../../../lib/config';
import { usePublicQuery } from '../../../../lib/use-api';
import { AdBar } from '../../../../components/AdBar';
import { MatchTabs } from '../../../../components/MatchTabs';
import { Button, ErrorBanner, Kicker, LoadingScreen } from '../../../../components/ui';
import { InningsScorecard } from '../../../../components/card/InningsScorecard';
import { OverByOver } from '../../../../components/card/OverByOver';
import { WagonWheelPanel } from '../../../../components/card/WagonWheelPanel';

type Tab = 'scorecard' | 'overs' | 'wheel';

export default function MatchCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('scorecard');
  const [inningsIndex, setInningsIndex] = useState<number | null>(null);

  const query = usePublicQuery<MatchCardResponse>(
    (t, signal) => api.matchCard(t, id, signal),
    [id],
  );

  if (query.isLoading) return <LoadingScreen />;

  if (query.error || !query.data) {
    return (
      <SafeAreaView className="bg-background flex-1 justify-center p-6">
        <Stack.Screen options={{ headerShown: false }} />
        <ErrorBanner message={query.error ?? 'Could not load this card.'} />
        <View className="mt-4">
          <Button label="Back to matches" onPress={() => router.replace('/matches')} />
        </View>
      </SafeAreaView>
    );
  }

  const card = query.data;

  // Export scorebook as CSV or JSON.
  function exportScorebook() {
    Alert.alert('Export scorebook', 'Every ball of this match, as a file.', [
      {
        text: 'CSV — one row per ball',
        onPress: () => void Linking.openURL(shareUrls.exportMatch(id, 'csv')),
      },
      {
        text: 'JSON — full scorecard',
        onPress: () => void Linking.openURL(shareUrls.exportMatch(id, 'json')),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  if (card.innings.length === 0) {
    return (
      <SafeAreaView className="bg-background flex-1">
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 justify-center px-6">
          <Kicker>Nothing to show yet</Kicker>
          <Text className="text-foreground/70 mt-3 text-[14px] leading-5">
            The card fills itself in as the match is scored. Bowl a ball and it appears here.
          </Text>
        </View>
        <MatchTabs matchId={id} active="card" />
      </SafeAreaView>
    );
  }

  // Default to the innings that decided it — the second/latest, when there is one.
  const activeIndex = inningsIndex ?? card.innings.length - 1;
  const index = Math.max(0, Math.min(activeIndex, card.innings.length - 1));
  const innings = card.innings[index] as CardInnings;

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header — the innings on show, and its result line. */}
      <View className="px-4 pb-2.5 pt-3">
        <View className="flex-row items-baseline justify-between gap-3">
          <Text
            className="text-foreground font-heading min-w-0 shrink text-[21px]"
            numberOfLines={1}
          >
            {innings.battingTeamName}
          </Text>
          <Text className="text-foreground font-heading shrink-0 text-[20px]">
            {innings.runs}-{innings.wickets}{' '}
            <Text className="text-foreground/55 text-[13px]">({innings.overs})</Text>
          </Text>
        </View>
        <Text
          className="font-heading mt-1 text-[9.5px] uppercase tracking-[1.4px] text-neutral-600"
          numberOfLines={1}
        >
          {[card.result, innings.target !== null ? `Target ${innings.target}` : null]
            .filter(Boolean)
            .join('  ·  ') || 'In progress'}
        </Text>
      </View>

      {/* Innings switch — only when there are two. */}
      {card.innings.length > 1 ? (
        <View className="flex-row gap-1.5 px-4 pb-2.5">
          {card.innings.map((inn, i) => (
            <Pressable
              key={inn.inningsNumber}
              accessibilityRole="tab"
              accessibilityState={{ selected: i === index }}
              onPress={() => setInningsIndex(i)}
              className={`h-8 shrink-0 justify-center border px-2.5 ${
                i === index ? 'bg-scoreboard border-scoreboard' : 'border-input'
              } active:opacity-70`}
            >
              <Text
                className={`font-heading text-[10.5px] uppercase tracking-[1.2px] ${
                  i === index ? 'text-scoreboard-text' : 'text-foreground'
                }`}
                numberOfLines={1}
              >
                {inn.battingTeamName}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Scorecard / Over by over */}
      <View className="flex-row px-4 pb-1">
        {(
          [
            ['scorecard', 'Scorecard'],
            ['overs', 'Over by over'],
            ['wheel', 'Wheel'],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            onPress={() => setTab(key)}
            className={`h-10 flex-1 items-center justify-center border ${
              tab === key ? 'bg-primary border-primary' : 'border-border'
            } active:opacity-80`}
          >
            <Text
              className={`font-heading text-[11.5px] uppercase tracking-[1.3px] ${
                tab === key ? 'text-primary-foreground' : 'text-foreground'
              }`}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerClassName="px-4 pb-4 pt-3"
        refreshControl={
          <RefreshControl refreshing={query.isRefreshing} onRefresh={() => void query.refresh()} />
        }
      >
        {tab === 'scorecard' ? (
          <InningsScorecard innings={innings} />
        ) : tab === 'overs' ? (
          <OverByOver innings={innings} />
        ) : (
          <WagonWheelPanel innings={innings} />
        )}
      </ScrollView>

      <View className="flex-row gap-2 px-4 pb-2">
        <View className="flex-1">
          <Button
            label="Share"
            variant="secondary"
            onPress={() => router.push({ pathname: '/matches/[id]/share', params: { id } })}
          />
        </View>
        <View className="flex-1">
          <Button
            label="Player cards"
            variant="secondary"
            onPress={() => router.push({ pathname: '/matches/[id]/cards', params: { id } })}
          />
        </View>
        <View className="flex-1">
          <Button label="Export" variant="secondary" onPress={exportScorebook} />
        </View>
      </View>

      <AdBar owned={card.isMine} />
      <MatchTabs matchId={id} active="card" />
    </SafeAreaView>
  );
}
