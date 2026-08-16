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
  const { user, isGuest, isLoading } = useSession();

  if (isLoading || user === undefined) return <LoadingScreen />;
  // Guests belong inside this group: the screens they can reach live here,
  // and every one of them reads a surface that is public anyway. What keeps
  // them out of the rest is the server refusing an unauthenticated write,
  // not this line.
  if (!user && !isGuest) return <Redirect href="/welcome" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
