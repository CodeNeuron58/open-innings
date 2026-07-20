'use client';

import { useEffect } from 'react';

/**
 * Global error boundary — unexpected server/render errors land here instead
 * of the raw Next.js crash screen. User-input problems never reach this
 * (actions redirect back to their form with a message).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        Something went wrong
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Rain stopped play</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        An unexpected error interrupted the innings. Your recorded balls are safe — every ball
        is stored as it happens.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="inline-flex h-10 items-center justify-center rounded-md border border-border px-5 text-sm font-medium transition-colors hover:bg-accent"
        >
          Back to dashboard
        </a>
      </div>
    </main>
  );
}
