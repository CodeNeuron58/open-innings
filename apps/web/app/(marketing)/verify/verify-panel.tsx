'use client';

/**
 * Spending a confirmation link, from the browser.
 *
 * Runs on mount rather than behind a button. The person has already clicked
 * something — the link in the mail — and asking them to click again to
 * "really" confirm is a step that exists only because of how the code is
 * organised.
 *
 * Every outcome says what to do next, including the ones that are not
 * failures. A link followed twice is a success from the reader's point of
 * view: they did what was asked, and telling them it did not work would be
 * both wrong and alarming.
 */
import { useEffect, useState } from 'react';

type State =
  { kind: 'working' } | { kind: 'done'; already: boolean } | { kind: 'error'; message: string };

export function VerifyPanel({ token }: { token: string }) {
  /*
   * A link with no token is known before anything runs, so it is the initial
   * state rather than something an effect discovers. Setting it from inside
   * the effect would schedule a second render to say what the first render
   * already had the information to say.
   */
  const [state, setState] = useState<State>(() =>
    token
      ? { kind: 'working' }
      : { kind: 'error', message: 'That link is missing its confirmation code.' },
  );

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/auth/verify', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const body = (await response.json().catch(() => null)) as {
          alreadyVerified?: boolean;
          error?: string;
        } | null;
        if (cancelled) return;

        if (!response.ok) {
          setState({ kind: 'error', message: body?.error ?? 'That link could not be used.' });
          return;
        }
        setState({ kind: 'done', already: Boolean(body?.alreadyVerified) });
      } catch {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: 'Could not reach the server. Try the link again in a moment.',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.kind === 'working') {
    return (
      <>
        <h1 className="oi-h1 oi-h1-sub oi-h1-tight">Confirming</h1>
        <p className="oi-lede oi-lede-mid">One moment.</p>
      </>
    );
  }

  if (state.kind === 'error') {
    return (
      <>
        <h1 className="oi-h1 oi-h1-sub oi-h1-tight">
          That link
          <br />
          did not work
        </h1>
        <p className="oi-lede oi-lede-mid">{state.message}</p>
        <p className="oi-body oi-dim-strong">
          Confirmation links last 24 hours. Open the app, and it will offer to send a new one — you
          stay signed in either way, because confirming an address unlocks password reset rather
          than access.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="oi-h1 oi-h1-sub oi-h1-tight">
        Email
        <br />
        confirmed
      </h1>
      <p className="oi-lede oi-lede-mid">
        {state.already
          ? 'This address was already confirmed — nothing more to do.'
          : 'That address is yours. If you ever lose your password, we can now get you back in.'}
      </p>
      <p className="oi-body oi-dim-strong">You can close this tab and go back to the app.</p>
    </>
  );
}
