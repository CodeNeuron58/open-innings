import '../global.css';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_700Bold,
} from '@expo-google-fonts/barlow';
import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed';
import { SessionProvider } from '../lib/session';
import { SettingsProvider } from '../lib/settings';
import { initPurchases } from '../lib/purchases';

/**
 * Barlow Condensed for headings and figures, Barlow for body — the Industry
 * pairing, matching the marketing site.
 *
 * The splash screen is held until they load rather than letting the app paint
 * in the system font and reflow. A scoreboard that jumps a few pixels the
 * moment fonts arrive reads as broken, and the condensed face is materially
 * narrower than any fallback, so the reflow would be large.
 */
void SplashScreen.preventAutoHideAsync();

/*
 * RevenueCat, configured once before anything renders.
 *
 * At module scope rather than in an effect because the SDK must be configured
 * before the first `getCustomerInfo` call, and `AdBar` asks on mount — an
 * effect in this component would still run first, but only by accident of
 * ordering. This makes it a fact rather than a race.
 *
 * A no-op when there is no API key, which is the state until one is set.
 */
initPurchases();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_700Bold,
    BarlowCondensed_600SemiBold,
  });

  useEffect(() => {
    // Hide on error too — a missing font is a worse reason to show nothing
    // than to render in the fallback face.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <SettingsProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </SettingsProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
