/**
 * The match exists — here is the link, and here is the keypad.
 *
 * Creation used to go straight to the console. The share link was never
 * offered at the one moment the scorer is standing next to the people who
 * would want it: the players' families, the opposition captain, whoever asked
 * to follow along.
 *
 * That is the whole growth argument of this product going unspoken. Every
 * scorecard is public and needs no account to read; the link is the thing
 * worth sending, and it was reachable only from the result screen after the
 * match had finished — by which time nobody needs to follow it.
 *
 * One screen, two actions, and the scoring one is the primary. This must not
 * become a wall between deciding to score and scoring.
 */
import { Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { shareUrls } from '../lib/config';
import { Button, Kicker } from './ui';

export function MatchStartedSheet({
  matchId,
  title,
  onScore,
}: {
  matchId: string;
  title: string;
  onScore: () => void;
}) {
  const url = shareUrls.match(matchId);
  const [copied, setCopied] = useState(false);

  async function share() {
    await Share.share({ message: `${title}\nFollow it live: ${url}` });
  }

  async function copy() {
    await Clipboard.setStringAsync(url);
    setCopied(true);
  }

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-1 px-5 pt-8">
        <Kicker>Match started</Kicker>
        <Text className="text-foreground font-heading mt-2 text-[28px] leading-[32px]">
          {title}
        </Text>

        <Text className="text-foreground/75 mt-4 text-[14.5px] leading-[21px]">
          Anyone with this link can watch the score as you tap it. No account, no app — it opens in
          a browser.
        </Text>

        <View className="border-border mt-5 border p-3.5">
          <Text className="text-foreground/80 font-sans text-[13.5px]" numberOfLines={2}>
            {url}
          </Text>
        </View>

        <View className="mt-4 flex-row gap-2">
          <View className="flex-1">
            <Button label="Share the link" onPress={() => void share()} />
          </View>
          <View className="flex-1">
            <Button
              label={copied ? 'Copied' : 'Copy'}
              variant="secondary"
              onPress={() => void copy()}
            />
          </View>
        </View>

        <Text className="text-foreground/65 mt-4 text-[13.5px] leading-[19px]">
          It is on the match card too, so this is not your only chance to send it.
        </Text>
      </View>

      {/* The reason they are here. */}
      <View className="border-border border-t px-5 pb-4 pt-3">
        <Button label="Start scoring" onPress={onScore} />
      </View>
    </SafeAreaView>
  );
}
