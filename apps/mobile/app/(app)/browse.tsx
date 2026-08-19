/**
 * Where a guest lands.
 * Accepts share links to open specific matches, players, or clubs.
 */
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { resolveLink } from '../../lib/guest';
import { useSession } from '../../lib/session';
import { Button, Field, Kicker } from '../../components/ui';

export default function Browse() {
  const router = useRouter();
  const { signOut } = useSession();
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerClassName="px-5 pb-8 pt-5" keyboardShouldPersistTaps="handled">
        <Kicker>Looking around</Kicker>
        <Text className="text-foreground font-heading mt-2 text-[30px] uppercase leading-[32px]">
          Open a{'\n'}scorecard
        </Text>
        <Text className="text-foreground/70 mt-3 text-[14px] leading-5">
          Paste a link someone sent you. Scorecards, career pages and club pages are public — no
          account needed to read any of them.
        </Text>

        <View className="pt-6">
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
          <Text className="text-destructive mt-2 text-[12.5px] leading-[18px]">{error}</Text>
        ) : null}

        <View className="mt-4 flex-row gap-2">
          <View className="flex-1">
            <Button label="Open" disabled={link.trim().length === 0} onPress={() => open(link)} />
          </View>
          <View className="flex-1">
            <Button label="Paste" variant="secondary" onPress={() => void pasteAndOpen()} />
          </View>
        </View>

        <View className="border-border mt-8 border-t pt-5">
          <Kicker>To keep a record</Kicker>
          <Text className="text-foreground/70 mt-2 text-[13.5px] leading-[19px]">
            Scoring a match needs an account — a scorebook has to belong to someone, or nobody can
            correct a ball later. It stays free, and the app is open source either way.
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
          className="mt-8 items-center py-2 active:opacity-60"
        >
          <Text className="font-heading text-[10px] uppercase tracking-[1.3px] text-neutral-600">
            Back to the start
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
