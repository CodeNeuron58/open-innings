/**
 * Handles deep links into the app.
 * Automatically signs in unauthenticated users as guests.
 */
import { useEffect } from 'react';
import { Redirect, type Href } from 'expo-router';
import { useSession } from '../lib/session';
import { LoadingScreen } from './ui';

export function DeepLink({ to }: { to: Href }) {
  const { user, isGuest, isLoading, continueAsGuest } = useSession();

  useEffect(() => {
    // `user === undefined` means the stored token is still being checked —
    // deciding anything then would race the answer.
    if (isLoading || user === undefined) return;
    if (user === null && !isGuest) void continueAsGuest();
  }, [isLoading, user, isGuest, continueAsGuest]);

  // Held rather than redirected while the session resolves, and for the frame
  // between "nobody is signed in" and the guest flag landing.
  if (isLoading || user === undefined) return <LoadingScreen />;
  if (!user && !isGuest) return <LoadingScreen />;

  return <Redirect href={to} />;
}
