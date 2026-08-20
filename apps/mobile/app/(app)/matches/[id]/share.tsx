/**
 * D3 — share.
 * Card preview uses the actual server-generated PNG endpoint.
 */
import { useState } from 'react';
import { Image, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import type { MatchResultResponse } from '@open-innings/shared';
import { api } from '../../../../lib/api';
import { CARD_ASPECT_RATIO, shareUrls } from '../../../../lib/config';
import { usePublicQuery } from '../../../../lib/use-api';
import { AdBar } from '../../../../components/AdBar';
import { MatchTabs } from '../../../../components/MatchTabs';
import { Button, ErrorBanner, Kicker, LoadingScreen } from '../../../../components/ui';

export default function ShareMatch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const query = usePublicQuery<MatchResultResponse>(
    (t, signal) => api.matchSummary(t, id, signal),
    [id],
  );

  if (query.isLoading) return <LoadingScreen />;

  const url = shareUrls.match(id);
  const m = query.data;
  const headline = m?.result ?? m?.title ?? 'Open Innings';

  async function copyLink() {
    await Clipboard.setStringAsync(url);
    setCopied(true);
    // Brief success message before reset.
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareCard() {
    const lines = (m?.innings ?? []).map(
      (i) => `${i.teamName} ${i.runs}-${i.wickets} (${i.overs})`,
    );
    await Share.share({ message: [headline, ...lines, url].join('\n') });
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
        <Text className="text-foreground font-heading min-w-0 flex-1 text-[19px]">Share</Text>
        <Text className="font-heading shrink-0 text-[9px] uppercase tracking-[1.3px] text-neutral-500">
          1080 × 1080
        </Text>
      </View>

      <ScrollView contentContainerClassName="px-4 pb-4">
        {query.error ? <ErrorBanner message={query.error} /> : null}

        {/* The real card, at the ratio it is actually generated at. */}
        <View className="border-border border">
          <Image
            source={{ uri: shareUrls.matchCardImage(id) }}
            style={{ width: '100%', aspectRatio: CARD_ASPECT_RATIO }}
            resizeMode="contain"
            accessibilityLabel={`Share card: ${headline}`}
          />
        </View>

        <View className="mt-4 flex-row gap-2">
          <View className="flex-1">
            <Button
              label={copied ? 'Link copied' : 'Copy live link'}
              variant="secondary"
              onPress={() => void copyLink()}
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
          {/* Uses system share sheet for compatibility. */}
          <Button label="Share the card" onPress={() => void shareCard()} />
        </View>

        <View className="border-border mt-5 border-t pt-3">
          <Kicker>What gets sent</Kicker>
          <Text className="text-foreground/60 mt-1.5 text-[12px] leading-[18px]">
            The link opens the live scorecard — it keeps updating while the match is on, and it
            never expires. The image is a snapshot of the score right now.
          </Text>
          {/* Footer branding omitted. */}
        </View>
      </ScrollView>

      <AdBar owned={m?.isMine ?? false} />
      <MatchTabs matchId={id} active="card" />
    </SafeAreaView>
  );
}
