/**
 * Auth group — login and signup.
 * Redirects signed-in users to prevent back-button loops to login.
 */
import { Redirect, Stack } from 'expo-router';
import { useSession } from '../../lib/session';
import { LoadingScreen } from '../../components/ui';

export default function AuthLayout() {
  const { user, isLoading } = useSession();

  if (isLoading || user === undefined) return <LoadingScreen />;
  // Guests are not bounced; allows them to sign up or log in.
  if (user) return <Redirect href="/matches" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
