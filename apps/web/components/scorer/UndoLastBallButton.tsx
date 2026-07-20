'use client';

import { useState } from 'react';
import { Undo2 } from 'lucide-react';

/**
 * Undo the last recorded ball via the ball API, then force a fresh server
 * render. Used on the innings-break screen (the scorer itself has its own undo).
 */
export function UndoLastBallButton({ matchId }: { matchId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function undo() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/ball`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to undo');
        setBusy(false);
        return;
      }
      window.location.reload();
    } catch {
      setError('Failed to undo');
      setBusy(false);
    }
  }

  return (
    <div className="text-center">
      <button
        onClick={undo}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        <Undo2 className="h-4 w-4" />
        Wrong call? Undo the last ball
      </button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
