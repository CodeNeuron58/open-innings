/**
 * Signed-in group.
 * Client-side guard for UX convenience. Security is enforced server-side.
 */
import { Redirect, Stack } from 'expo-router';
import { useSession } from '../../lib/session';
import { LoadingScreen } from '../../components/ui';

export default function AppLayout() {
  const { user, isGuest, isLoading } = useSession();

  if (isLoading || user === undefined) return <LoadingScreen />;
  // Guests are allowed as they only read public surfaces. Unauthorized writes are blocked by the server.
  if (!user && !isGuest) return <Redirect href="/welcome" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
