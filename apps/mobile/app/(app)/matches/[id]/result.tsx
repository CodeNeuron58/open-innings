/**
 * C5 — the result.
 * Shows match summary and sharing options. Data from /summary (not /scorer).
 */
import { useState } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { MatchPerformer, MatchResultResponse, ScorerPlayer } from '@open-innings/shared';
import { api } from '../../../../lib/api';
import { shareUrls } from '../../../../lib/config';
import { usePublicQuery, useApiMutation } from '../../../../lib/use-api';
import { OpenersSheet } from '../../../../components/scorer/Sheets';
import { Button, Card, ErrorBanner, Kicker, LoadingScreen } from '../../../../components/ui';

export default function Result() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = usePublicQuery<MatchResultResponse>(
    (t, signal) => api.matchSummary(t, id, signal),
    [id],
  );
  // Super Over initiation. Squads fetched on tap as /scorer is owner-only.
  const mutation = useApiMutation();
  const [superOverSquads, setSuperOverSquads] = useState<{
    batting: ScorerPlayer[];
    bowling: ScorerPlayer[];
  } | null>(null);

  async function openSuperOver() {
    const scorer = await mutation.run((t) => api.scorer(t, id));
    if (!scorer) return;
    // The side that batted second in the match bats first in the Super Over.
    setSuperOverSquads({ batting: scorer.battingSquad, bowling: scorer.bowlingSquad });
  }

  async function startSuperOver(openers: {
    openingStrikerId: string;
    openingNonStrikerId: string;
    openingBowlerId: string;
  }) {
    const started = await mutation.run((t) => api.startNextInnings(t, id, openers));
    if (started === null) return;
    setSuperOverSquads(null);
    router.replace({ pathname: '/matches/[id]/score', params: { id } });
  }

  if (query.isLoading) return <LoadingScreen />;

  if (query.error || !query.data) {
    return (
      <SafeAreaView className="bg-background flex-1 justify-center p-6">
        <Stack.Screen options={{ headerShown: false }} />
        <ErrorBanner message={query.error ?? 'Could not load this result.'} />
        <View className="mt-4">
          <Button label="Back to matches" onPress={() => router.replace('/matches')} />
        </View>
      </SafeAreaView>
    );
  }

  const m = query.data;
  const url = shareUrls.match(id);

  // The result line is the server's, written when the match was completed.
  const headline = m.result ?? 'Match ended';

  // Direct hand-off to the OS share sheet — text and a link, no card.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for the direct-share path
  async function share() {
    const lines = m.innings.map((i) => `${i.teamName} ${i.runs}-${i.wickets} (${i.overs})`);
    await Share.share({ message: [headline, ...lines, url].join('\n') });
  }

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerClassName="pb-4">
        <View className="flex-row items-baseline justify-between gap-3 px-4 pb-1 pt-3">
          <Kicker>Match ended</Kicker>
          {/* SAVED & SYNCED omitted as balls are synced immediately. */}
        </View>

        <Text className="text-foreground font-heading px-4 text-[31px] leading-[35px]">
          {headline}
        </Text>
        {m.venue ? (
          <Text className="text-foreground/60 mt-1.5 px-4 text-[13px]">{m.venue}</Text>
        ) : null}

        {/* Both innings, in the order they were played. */}
        <View className="mt-5 px-4">
          {m.innings.map((i, idx) => (
            <View
              key={`${i.teamName}-${idx}`}
              className="border-border flex-row items-baseline justify-between gap-3 border-b py-3"
            >
              <Text className="text-foreground min-w-0 flex-1 text-[15px]" numberOfLines={1}>
                {i.teamName}
              </Text>
              <Text className="text-foreground font-heading shrink-0 text-[16px]">
                {i.runs}-{i.wickets}{' '}
                <Text className="text-foreground/55 text-[13px]">({i.overs})</Text>
              </Text>
            </View>
          ))}
        </View>

        {/* Framed player of the match card. */}
        {m.playerOfTheMatch ? (
          <View className="mx-4 mt-6">
            <Card>
              <Kicker>Player of the match</Kicker>
              <Text className="text-foreground font-heading mt-2 text-[22px]">
                {m.playerOfTheMatch.name}
              </Text>
              <Text className="text-steel-700 font-heading mt-0.5 text-[15px]">
                {m.playerOfTheMatch.line}
              </Text>
              <Text className="text-foreground/50 mt-2 text-[11.5px] leading-4">
                Computed from the ball log — runs plus twenty a wicket. Nobody voted.
              </Text>
            </Card>
          </View>
        ) : null}

        <View className="mt-3 flex-row gap-3 px-4">
          <Standout
            label="Best bowling"
            performer={m.bestBowler}
            format={(p) => `${p.primary}/${p.secondary}`}
          />
          <Standout label="Most sixes" performer={m.mostSixes} format={(p) => String(p.primary)} />
        </View>

        {/* Super Over handling for tied matches. */}
        {m.canStartSuperOver ? (
          <View className="border-steel-300 bg-steel-100 mx-4 mt-6 border p-3.5">
            <Text className="text-steel-900 font-heading text-[15px]">Scores level</Text>
            <Text className="text-steel-800/75 mt-1 text-[12.5px] leading-[18px]">
              One over each, two wickets. The side that batted second bats first.
            </Text>
            {mutation.error ? (
              <Text className="text-destructive mt-2 text-[12.5px]">{mutation.error}</Text>
            ) : null}
            <View className="mt-3">
              <Button
                label={mutation.busy ? 'Loading squads…' : 'Start the Super Over'}
                disabled={mutation.busy}
                onPress={() => void openSuperOver()}
              />
            </View>
          </View>
        ) : null}

        <Text className="text-foreground/55 mt-6 px-4 text-[12.5px] leading-[18px]">
          Everything above is generated from the ball log: a card for each side, one per player,
          plus the public scorecard link.
        </Text>
      </ScrollView>

      <View className="border-border border-t px-4 pb-3 pt-3">
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button
              label="Full scorecard"
              variant="secondary"
              onPress={() => router.push({ pathname: '/matches/[id]/card', params: { id } })}
            />
          </View>
          <View className="flex-1">
            <Button
              label="Player cards"
              variant="secondary"
              onPress={() => router.push({ pathname: '/matches/[id]/cards', params: { id } })}
            />
          </View>
        </View>
        <View className="mt-2">
          <Button
            label="Share the result"
            onPress={() => router.push({ pathname: '/matches/[id]/share', params: { id } })}
          />
        </View>
        <View className="mt-1">
          <Button
            label="Back to matches"
            variant="ghost"
            onPress={() => router.replace('/matches')}
          />
        </View>
      </View>

      {superOverSquads ? (
        <OpenersSheet
          title="Super Over"
          subtitle="One over each, two wickets. Who opens?"
          battingSquad={superOverSquads.batting}
          bowlingSquad={superOverSquads.bowling}
          busy={mutation.busy}
          error={mutation.error}
          onConfirm={(openers) => void startSuperOver(openers)}
          onCancel={() => setSuperOverSquads(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

/** One figure in a framed half-width cell — best bowling, most sixes. */
function Standout({
  label,
  performer,
  format,
}: {
  label: string;
  performer: MatchPerformer | null;
  format: (p: MatchPerformer) => string;
}) {
  return (
    <View className="border-border flex-1 border p-3">
      <Kicker>{label}</Kicker>
      {performer ? (
        <>
          <Text className="text-foreground mt-1.5 text-[14px]" numberOfLines={1}>
            {performer.name}
          </Text>
          <Text className="text-foreground font-heading mt-0.5 text-[17px]">
            {format(performer)}
          </Text>
        </>
      ) : (
        // A match can genuinely have no six and no wicket. Say so.
        <Text className="text-foreground/45 mt-1.5 text-[13px]">None</Text>
      )}
    </View>
  );
}
