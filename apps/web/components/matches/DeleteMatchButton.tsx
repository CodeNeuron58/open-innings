'use client';

import { Trash2 } from 'lucide-react';

/**
 * Destructive action, so it's gated by a plain `confirm()` before the form
 * (bound to the `deleteMatchAction` server action) is allowed to submit.
 * No fetch/JSON here — a native form post is enough, this is progressive
 * enhancement on top of a real form action.
 */
export function DeleteMatchButton({
  matchId,
  action,
}: {
  matchId: string;
  action: (matchId: string) => Promise<void>;
}) {
  return (
    <form
      action={action.bind(null, matchId)}
      onSubmit={(e) => {
        if (!window.confirm('Delete this match permanently? This cannot be undone.')) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        title="Delete match"
        aria-label="Delete match"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
