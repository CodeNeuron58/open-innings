/**
 * Launch route — decides where you land.
 *
 * Renders nothing itself. The session provider is still verifying the stored
 * token against the server when this first mounts, so it holds a spinner
 * rather than flashing the login screen at someone who is already signed in.
 */
import { Redirect } from 'expo-router';
import { useSession } from '../lib/session';
import { LoadingScreen } from '../components/ui';

export default function Index() {
  const { user, isLoading } = useSession();

  if (isLoading || user === undefined) return <LoadingScreen />;

  return <Redirect href={user ? '/matches' : '/login'} />;
}
