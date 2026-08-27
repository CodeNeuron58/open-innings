/**
 * Splash and launch route.
 * Holds the screen until session provider verifies the stored token.
 */
import { useEffect, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack } from 'expo-router';
import Constants from 'expo-constants';
import { useSession } from '../lib/session';

export default function Index() {
  const { user, isGuest, isLoading } = useSession();

  // A determinate-looking sweep animation for indeterminate progress.
  // Uses lazy useState rather than useRef to ensure stability during render.
  const [sweep] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1400, useNativeDriver: false }),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  if (!(isLoading || user === undefined)) {
    // A guest has no matches of their own, so the matches list would be an
    // empty screen. They land on the one place built for them instead.
    if (user) return <Redirect href="/matches" />;
    return <Redirect href={isGuest ? '/browse' : '/welcome'} />;
  }

  return (
    <View className="bg-scoreboard flex-1">
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 justify-end px-6 pb-6">
        <Text className="text-scoreboard-text font-heading text-[46px] uppercase leading-[45px] tracking-[-1px]">
          Open{'\n'}Innings
        </Text>
        <Text className="text-scoreboard-muted font-heading mt-2.5 text-[13px] uppercase tracking-[1.8px]">
          Score every ball
        </Text>

        <View className="mt-10">
          <View className="bg-scoreboard-border h-px w-full overflow-hidden">
            <Animated.View
              className="bg-scoreboard-accent h-px"
              style={{
                width: sweep.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['8%', '100%'],
                }),
                opacity: sweep.interpolate({
                  inputRange: [0, 0.85, 1],
                  outputRange: [1, 1, 0],
                }),
              }}
            />
          </View>
          <View className="mt-3 flex-row items-center justify-between">
            <Text className="text-scoreboard-muted font-heading text-[10px] uppercase tracking-[1.6px]">
              Loading your scorebook
            </Text>
            <Text className="text-scoreboard-muted font-heading text-[10px] uppercase tracking-[1.6px]">
              v{Constants.expoConfig?.version ?? '0.1.0'} · Open source
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
