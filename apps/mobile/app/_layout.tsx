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
 * Global font pairing (Barlow & Barlow Condensed).
 * Splash screen is held until fonts load to prevent layout shift.
 */
void SplashScreen.preventAutoHideAsync();

// Initialize RevenueCat at module scope to ensure config before mount.
initPurchases();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_700Bold,
    BarlowCondensed_600SemiBold,
  });

  useEffect(() => {
    // Hide splash screen even on error to allow fallback fonts.
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
