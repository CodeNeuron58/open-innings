'use client';

/**
 * Asking for a reset link, and spending one.
 *
 * ## The request half never says whether the address exists
 *
 * The server returns the same sentence either way, and this renders that
 * sentence verbatim rather than composing its own. Wording written here —
 * "check your inbox" against "no account found" — is exactly how a careful
 * server gets undone by a helpful client.
 *
 * ## The set-password half asks twice
 *
 * A typo in a password you cannot see, on the one screen where there is no old
 * password to fall back on, locks you out of the account you are in the middle
 * of recovering. The match is checked here rather than server-side because the
 * server has no business knowing you typed it twice.
 */
import { useState } from 'react';

type State =
  | { kind: 'idle' | 'sending' }
  | { kind: 'sent'; message: string }
  | { kind: 'error'; message: string };

export function ResetPanel({ token }: { token: string }) {
  return token ? <SetPassword token={token} /> : <RequestLink />;
}

function RequestLink() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState({ kind: 'sending' });
    try {
      const response = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;

      if (!response.ok) {
        setState({ kind: 'error', message: body?.error ?? 'That did not go through.' });
        return;
      }
      // The server's sentence, unedited. See the note above.
      setState({ kind: 'sent', message: body?.message ?? 'Check your inbox.' });
    } catch {
      setState({ kind: 'error', message: 'Could not reach the server. Try again in a moment.' });
    }
  }

  if (state.kind === 'sent') {
    return (
      <>
        <h1 className="oi-h1 oi-h1-sub oi-h1-tight">
          Check
          <br />
          your inbox
        </h1>
        <p className="oi-lede oi-lede-mid">{state.message}</p>
        <p className="oi-body oi-dim-strong">
          Nothing yet? Look in spam. This is a new sending domain, and filters are cautious with
          those for the first few weeks.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="oi-h1 oi-h1-sub oi-h1-tight">
        Forgot your
        <br />
        password
      </h1>
      <p className="oi-lede oi-lede-mid">A link that works once, and for an hour.</p>

      <form className="oi-signup" onSubmit={submit}>
        <input
          className="input"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email address"
        />
        <button
          type="submit"
          className="btn btn-primary oi-signup-btn"
          disabled={state.kind === 'sending'}
        >
          {state.kind === 'sending' ? 'Sending' : 'Send the link'}
        </button>
      </form>

      {state.kind === 'error' ? (
        <p className="oi-card-body oi-measure" role="status">
          {state.message}
        </p>
      ) : null}
    </>
  );
}

function SetPassword({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  const mismatch = again.length > 0 && password !== again;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mismatch) return;
    setState({ kind: 'sending' });
    try {
      const response = await fetch('/api/auth/reset', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;

      if (!response.ok) {
        setState({ kind: 'error', message: body?.error ?? 'That did not work.' });
        return;
      }
      setState({ kind: 'sent', message: body?.message ?? 'Password changed.' });
    } catch {
      setState({ kind: 'error', message: 'Could not reach the server. Try again in a moment.' });
    }
  }

  if (state.kind === 'sent') {
    return (
      <>
        <h1 className="oi-h1 oi-h1-sub oi-h1-tight">
          Password
          <br />
          changed
        </h1>
        <p className="oi-lede oi-lede-mid">{state.message}</p>
        <p className="oi-body oi-dim-strong">
          Open the app and sign in with the new one. Signing every device out is deliberate — the
          usual reason for a reset is that somebody else may know the old password.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="oi-h1 oi-h1-sub oi-h1-tight">
        Choose a new
        <br />
        password
      </h1>
      <p className="oi-lede oi-lede-mid">
        At least eight characters, twice — so a typo cannot lock you out of the account you are
        recovering.
      </p>

      <form className="oi-signup" onSubmit={submit}>
        <input
          className="input"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          aria-label="New password"
        />
        <input
          className="input"
          type="password"
          required
          autoComplete="new-password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          placeholder="Again"
          aria-label="Repeat the new password"
        />
        <button
          type="submit"
          className="btn btn-primary oi-signup-btn"
          disabled={state.kind === 'sending' || mismatch}
        >
          {state.kind === 'sending' ? 'Saving' : 'Change it'}
        </button>
      </form>

      {mismatch ? (
        <p className="oi-card-body oi-measure" role="status">
          Those two do not match.
        </p>
      ) : null}
      {state.kind === 'error' ? (
        <p className="oi-card-body oi-measure" role="status">
          {state.message}
        </p>
      ) : null}
    </>
  );
}
