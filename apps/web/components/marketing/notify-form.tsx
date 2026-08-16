'use client';

/**
 * "Tell me when it's out."
 *
 * A client island in an otherwise static landing page — the form is the only
 * thing here that needs state, and making the whole page a client component
 * for one input would ship the marketing copy as JavaScript.
 *
 * Every outcome says something specific. "Something went wrong" on a form
 * someone typed their address into is the fastest way to make them assume the
 * product is as vague as its error messages.
 */
import { useState } from 'react';
import { BlueprintButton } from './blueprint';

type State = { kind: 'idle' | 'sending' | 'done' } | { kind: 'error'; message: string };

export function NotifyForm({ source }: { source?: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState({ kind: 'sending' });

    try {
      const response = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        // The server's own message — it knows whether this was a malformed
        // address or the tenth attempt this hour, and either is worth saying.
        setState({ kind: 'error', message: body?.error ?? 'That did not go through.' });
        return;
      }

      setState({ kind: 'done' });
    } catch {
      setState({ kind: 'error', message: 'Could not reach the server. Try again in a moment.' });
    }
  }

  if (state.kind === 'done') {
    return (
      <p className="oi-card-body oi-measure" role="status">
        <strong>You&rsquo;re on the list.</strong> Release notes when there are some — nothing else,
        and no launch countdowns.
      </p>
    );
  }

  return (
    <>
      <form className="oi-signup" onSubmit={submit}>
        <input
          className="input"
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@club.in"
          aria-label="Email address"
          autoComplete="email"
          required
          disabled={state.kind === 'sending'}
        />
        <BlueprintButton
          type="submit"
          className="btn btn-primary oi-signup-btn"
          disabled={state.kind === 'sending'}
        >
          {state.kind === 'sending' ? 'Adding…' : 'Notify me'}
        </BlueprintButton>
      </form>

      {state.kind === 'error' ? (
        <p
          className="oi-card-body oi-measure"
          role="alert"
          style={{ color: 'var(--color-destructive)' }}
        >
          {state.message}
        </p>
      ) : null}
    </>
  );
}
