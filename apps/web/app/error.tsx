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
      <p className="text-muted-foreground text-sm font-semibold uppercase tracking-widest">
        Something went wrong
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Rain stopped play</h1>
      <p className="text-muted-foreground mt-2 max-w-md">
        An unexpected error interrupted the innings. Your recorded balls are safe — every ball is
        stored as it happens.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-5 text-sm font-medium transition-colors"
        >
          Try again
        </button>
        {/*
          There is no dashboard on the web any more — that moved to the app
          when this site became the landing page. Home is the only place worth
          offering someone who has just hit an error.

          A plain `<a>`, not `<Link>`, and deliberately. This is the error
          boundary: soft navigation would keep the same React tree that just
          threw, so "go home" could land on the same broken state it was meant
          to escape. A full document load is the point.
        */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="border-border hover:bg-accent inline-flex h-10 items-center justify-center rounded-md border px-5 text-sm font-medium transition-colors"
        >
          Back to home
        </a>
      </div>
    </main>
  );
}
