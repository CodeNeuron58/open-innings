/**
 * A1 — Splash.
 *
 * Also the launch route: it decides where you land. The session provider is
 * still verifying the stored token against the server when this first mounts,
 * so rather than flashing a login form at someone already signed in, it holds
 * this screen until the answer arrives.
 *
 * Reversed steel field — the same one the score plate uses — so the first
 * thing anyone sees is the app's one heavy object.
 */
import { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack } from 'expo-router';
import Constants from 'expo-constants';
import { useSession } from '../lib/session';

export default function Index() {
  const { user, isLoading } = useSession();

  // A determinate-looking sweep rather than a spinner. It is honest about
  // being indeterminate — it never claims a percentage — but it reads as
  // progress instead of a stall.
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1400, useNativeDriver: false }),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  if (!(isLoading || user === undefined)) {
    return <Redirect href={user ? '/matches' : '/welcome'} />;
  }

  return (
    <View className="bg-scoreboard flex-1">
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 justify-end px-6 pb-6">
        <Text className="text-scoreboard-text font-heading text-[44px] uppercase leading-[42px]">
          Open{'\n'}Innings
        </Text>
        <Text className="text-scoreboard-muted font-heading mt-3 text-[11px] uppercase tracking-[2px]">
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
