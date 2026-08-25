/**
 * Where a guest lands.
 *
 * This was a link field, a Paste button, and an error string about `/m/`,
 * `/p/` and `/c/`. Somebody who had a link did not need the screen; somebody
 * who did not had nothing whatever to do. That is a poor first minute for the
 * one product surface that exists to be shared, and it was the whole top of
 * the funnel.
 *
 * It now opens on matches being played. Nothing new is disclosed by that —
 * `matches` is publicly readable, `/m/<id>` is the link people send, and the
 * card endpoint behind it takes no token. Only the listing was missing.
 *
 * The link box stays, underneath. It is the right tool when somebody has been
 * sent a specific match, which is still the commonest way in.
 */
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import type { MatchListResponse } from '@open-innings/shared';
import { api } from '../../lib/api';
import { resolveLink } from '../../lib/guest';
import { useSession } from '../../lib/session';
import { usePublicQuery } from '../../lib/use-api';
import { Button, ErrorBanner, Field, Kicker } from '../../components/ui';
import { FinishedMatch, LiveMatch, isLive, type MatchRow } from '../../components/MatchCard';

export default function Browse() {
  const router = useRouter();
  const { signOut } = useSession();
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Public, so it runs with or without a token — a signed-in scorer looking at
  // other people's cricket is the same request as a guest doing it.
  const query = usePublicQuery<MatchListResponse>((_t, signal) => api.publicMatches(signal), []);

  useFocusEffect(
    useCallback(() => {
      void query.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: refresh is stable
    }, [query.refresh]),
  );

  function open(raw: string) {
    setError(null);
    const target = resolveLink(raw);

    if (!target) {
      setError('That does not look like an Open Innings link. It should contain /m/, /p/ or /c/.');
      return;
    }

    if (target.kind === 'match') {
      router.push({ pathname: '/matches/[id]/card', params: { id: target.id } });
    } else if (target.kind === 'player') {
      router.push({ pathname: '/players/[id]', params: { id: target.id } });
    } else {
      router.push({ pathname: '/teams/[id]', params: { id: target.id } });
    }
  }

  /** Paste and open link directly. */
  async function pasteAndOpen() {
    const text = await Clipboard.getStringAsync();
    if (!text) {
      setError('Nothing on the clipboard to paste.');
      return;
    }
    setLink(text);
    open(text);
  }

  const matches = query.data?.matches ?? [];
  const live = matches.filter(isLive);
  const done = matches.filter((m) => !isLive(m));

  const openCard = (m: MatchRow) =>
    router.push({ pathname: '/matches/[id]/card', params: { id: m.id } });

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <View className="px-5 pb-2 pt-4">
        <Kicker>Looking around</Kicker>
        <Text className="text-foreground font-heading mt-1.5 text-[26px] uppercase">
          Live cricket
        </Text>
      </View>

      {query.error ? (
        <View className="px-5 pb-3">
          <ErrorBanner message={query.error} />
        </View>
      ) : null}

      <FlatList
        data={done}
        keyExtractor={(m) => m.id}
        contentContainerClassName="px-5 pb-10"
        refreshControl={
          <RefreshControl refreshing={query.isRefreshing} onRefresh={query.refresh} />
        }
        ListHeaderComponent={
          <View>
            {live.length > 0 ? (
              <View className="pb-6">
                <View className="pb-3">
                  <Kicker>Being played now</Kicker>
                </View>
                <View className="gap-3">
                  {live.map((m) => (
                    // No `onOptions` — these are other people's matches, and
                    // the settings behind it are not the reader's to open.
                    <LiveMatch key={m.id} match={m} onPress={() => openCard(m)} />
                  ))}
                </View>
              </View>
            ) : null}

            {done.length > 0 ? (
              <View className="pb-1">
                <Kicker>{live.length > 0 ? 'Recently finished' : 'Recent matches'}</Kicker>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          live.length === 0 && !query.isLoading && !query.error ? (
            <View className="border-border border p-5">
              <Kicker>Nothing being played</Kicker>
              <Text className="text-foreground/75 mt-3 text-[14px] leading-5">
                No public matches yet. Open a link somebody sent you, or start scoring your own — it
                appears here the moment the first ball is bowled.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => <FinishedMatch match={item} onPress={() => openCard(item)} />}
        ListFooterComponent={
          <View className="pt-8">
            <View className="border-border border-t pt-5">
              <Kicker>Sent a link?</Kicker>
              <View className="pt-3">
                <Field
                  label="Link"
                  value={link}
                  onChangeText={setLink}
                  onSubmitEditing={() => open(link)}
                  placeholder="openinnings.com/m/…"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="go"
                />
              </View>

              {error ? (
                <Text className="text-destructive mt-2 text-[13.5px] leading-[18px]">{error}</Text>
              ) : null}

              <View className="mt-4 flex-row gap-2">
                <View className="flex-1">
                  <Button
                    label="Open"
                    disabled={link.trim().length === 0}
                    onPress={() => open(link)}
                  />
                </View>
                <View className="flex-1">
                  <Button label="Paste" variant="secondary" onPress={() => void pasteAndOpen()} />
                </View>
              </View>
            </View>

            <View className="border-border mt-8 border-t pt-5">
              <Kicker>To keep a record</Kicker>
              <Text className="text-foreground/75 mt-2 text-[13.5px] leading-[19px]">
                Scoring a match needs an account — a scorebook has to belong to someone, or nobody
                can correct a ball later. It stays free, and the app is open source either way.
              </Text>
              <View className="mt-4">
                <Button label="Create an account" onPress={() => router.push('/signup')} />
              </View>
              <View className="mt-2">
                <Button
                  label="I already have one"
                  variant="secondary"
                  onPress={() => router.push('/login')}
                />
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => void signOut()}
              className="mt-8 h-11 items-center justify-center active:opacity-60"
            >
              <Text className="font-heading text-[11px] uppercase tracking-[1.3px] text-neutral-700">
                Back to the start
              </Text>
            </Pressable>
          </View>
        }
      />
    </SafeAreaView>
  );
}
