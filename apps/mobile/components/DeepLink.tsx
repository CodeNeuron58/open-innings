/**
 * The landing pad for a shared link.
 *
 * `openinnings.com/m/<id>` is a *web* address, and the app's route for the
 * same thing is `/matches/<id>/card`. Android hands the app the URL exactly
 * as it was tapped, so these three shapes have to exist in the app and
 * forward to the real screens.
 *
 * ## Why it signs you in as a guest
 *
 * Someone tapping a scorecard in a WhatsApp group has, by definition, not
 * signed in. Bouncing them to a welcome screen would answer a question they
 * did not ask and lose the thing they came for — and the scorecard is public
 * anyway, readable by anyone with the link whether or not they have the app.
 *
 * So an unauthenticated arrival becomes a guest automatically. It grants
 * nothing a browser would not already have given them, and the account
 * prompt is still one tap away on every screen that needs one.
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
