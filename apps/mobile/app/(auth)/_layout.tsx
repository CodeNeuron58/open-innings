/**
 * Auth group — login and signup.
 *
 * Bounces anyone already signed in, so the back button from the app can't
 * land them on a login form for the account they're currently using.
 */
import { Redirect, Stack } from 'expo-router';
import { useSession } from '../../lib/session';
import { LoadingScreen } from '../../components/ui';

export default function AuthLayout() {
  const { user, isLoading } = useSession();

  if (isLoading || user === undefined) return <LoadingScreen />;
  if (user) return <Redirect href="/matches" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
