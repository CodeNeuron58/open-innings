/**
 * C5 — the result.
 *
 * The last screen of a match and the first screen of the next one, because
 * this is where a scorer either sends the card to twenty-one other people or
 * closes the app and nobody else ever sees it. Everything below the result
 * line is there to be shared, not to be read here.
 *
 * Its data comes from `/summary` rather than `/scorer`: the scorer endpoint
 * replays only the innings in progress, and a result needs both. Player of the
 * match, best bowling and most sixes are all computed server-side from the
 * ball log, so this screen and the share card can never disagree.
 */
import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { MatchPerformer, MatchResultResponse, ScorerResponse } from '@open-innings/shared';
import { api } from '../../../../lib/api';
import { shareUrls } from '../../../../lib/config';
import { useApiQuery } from '../../../../lib/use-api';
import { Button, Card, ErrorBanner, Kicker, LoadingScreen } from '../../../../components/ui';

export default function Result() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [pickingPlayer, setPickingPlayer] = useState(false);

  const query = useApiQuery<MatchResultResponse>(
    (t, signal) => api.matchSummary(t, id, signal),
    [id],
  );
  // Only for the player list behind "Player cards" — the summary names four
  // people at most, and every one of the twenty-two has a card worth sending.
  const squads = useApiQuery<ScorerResponse>((t, signal) => api.scorer(t, id, signal), [id]);

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

  // The result line is the server's, written when the match was completed. If
  // it is missing the match did not finish — say that rather than inventing a
  // winner from the scores, which would be wrong for a tie, a washout or an
  // innings that was simply ended early.
  const headline = m.result ?? 'Match ended';

  const players = squads.data?.players ?? [];

  async function share() {
    const lines = m.innings.map((i) => `${i.teamName} ${i.runs}-${i.wickets} (${i.overs})`);
    await Share.share({ message: [headline, ...lines, url].join('\n') });
  }

  async function sharePlayer(playerId: string, name: string) {
    setPickingPlayer(false);
    await Share.share({
      message: `${name} — ${headline}\n${shareUrls.playerInMatch(id, playerId)}`,
    });
  }

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerClassName="pb-4">
        <View className="flex-row items-baseline justify-between gap-3 px-4 pb-1 pt-3">
          <Kicker>Match ended</Kicker>
          {/*
            The design says "SAVED & SYNCED" here. Every ball already went to
            the server as it was scored — there is nothing to sync and no
            queue that could be behind — so claiming it would be theatre.
          */}
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

        {/* The one framed object on the screen — Card brings the blueprint
            corners the design draws at its edges. */}
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
              {/* Said plainly, because it is not an award anyone voted on. */}
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
              onPress={() => void Linking.openURL(url)}
            />
          </View>
          <View className="flex-1">
            <Button
              label="Player cards"
              variant="secondary"
              disabled={players.length === 0}
              onPress={() => setPickingPlayer(true)}
            />
          </View>
        </View>
        <View className="mt-2">
          <Button label="Share the result" onPress={() => void share()} />
        </View>
        <View className="mt-1">
          <Button
            label="Back to matches"
            variant="ghost"
            onPress={() => router.replace('/matches')}
          />
        </View>
      </View>

      {pickingPlayer ? (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setPickingPlayer(false)}
        >
          <View className="flex-1 justify-end bg-black/50">
            <View className="bg-background border-border max-h-[80%] border-t-2 px-4 pb-4 pt-3.5">
              <View className="flex-row items-baseline justify-between gap-3">
                <View className="min-w-0 flex-1">
                  <Text className="text-foreground font-heading text-[21px]">Player cards</Text>
                  <Text className="text-foreground/65 mt-0.5 text-[12.5px]">
                    One card each — whoever you send it to gets their own figures.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setPickingPlayer(false)}
                  className="shrink-0 px-1 py-1 active:opacity-60"
                >
                  <Text className="font-heading text-[11px] uppercase tracking-[1.4px] text-neutral-600">
                    Close
                  </Text>
                </Pressable>
              </View>

              <ScrollView className="border-border mt-4 border-t">
                {players.map((p) => (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Share ${p.fullName}'s card`}
                    onPress={() => void sharePlayer(p.id, p.fullName)}
                    className="border-border min-h-14 flex-row items-center justify-between gap-3 border-b px-1 active:opacity-70"
                  >
                    <Text className="text-foreground min-w-0 flex-1 text-[15px]" numberOfLines={1}>
                      {p.fullName}
                    </Text>
                    <Text className="text-steel-700 font-heading shrink-0 text-[10px] uppercase tracking-[1.3px]">
                      Share
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
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
