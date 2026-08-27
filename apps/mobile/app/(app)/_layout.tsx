/**
 * Signed-in group.
 * Client-side guard for UX convenience. Security is enforced server-side.
 */
import { Redirect, Stack, useSegments } from 'expo-router';
import { useSession } from '../../lib/session';
import { gateFor } from '../../lib/gate';
import { LoadingScreen } from '../../components/ui';

/*
 * An account is not finished until the address on it has been proved.
 *
 * Signup mails a six-digit code already, and until now confirming it was
 * optional — the screen even offered "Do this later". That made the address on
 * an account a claim rather than a fact: a typo locked somebody out of their
 * own password reset with no way back.
 *
 * The decision itself is in `lib/gate.ts`, where it can be tested. This file
 * only turns the answer into a screen.
 */
export default function AppLayout() {
  const { user, isGuest, isLoading } = useSession();
  // Hooks run unconditionally, before any early return.
  const segments = useSegments();

  switch (
    gateFor({
      user,
      isGuest,
      isLoading,
      onVerifyScreen: segments[segments.length - 1] === 'verify',
    })
  ) {
    case 'loading':
      return <LoadingScreen />;
    case 'welcome':
      return <Redirect href="/welcome" />;
    case 'verify':
      return <Redirect href="/verify" />;
    case 'allow':
      return <Stack screenOptions={{ headerShown: false }} />;
  }
}
