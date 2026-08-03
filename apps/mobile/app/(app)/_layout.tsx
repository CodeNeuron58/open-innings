/**
 * Signed-in group.
 *
 * The guard here is convenience, not security — it decides what to render,
 * and a client-side check can always be bypassed. Every endpoint behind it
 * re-verifies the bearer token server-side and scopes rows to the owner.
 */
import { Redirect, Stack } from 'expo-router';
import { useSession } from '../../lib/session';
import { LoadingScreen } from '../../components/ui';

export default function AppLayout() {
  const { user, isLoading } = useSession();

  if (isLoading || user === undefined) return <LoadingScreen />;
  if (!user) return <Redirect href="/login" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
