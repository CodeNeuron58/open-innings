import type { BatsmanStats } from '@/lib/scoring';

type Props = {
  batting: Record<string, BatsmanStats>;
  strikerId?: string;
  nonStrikerId?: string;
  playerNames: Record<string, string>;
  /** Max batter order shown (skip retired-not-out etc). */
  limit?: number;
};

export function BattingCard({ batting, strikerId, nonStrikerId, playerNames, limit }: Props) {
  // JS preserves insertion order on Object.keys — `batting` was built up
  // batters faced their first ball, so this gives us batting-order for free.
  const rows = Object.values(batting);
  const visible = limit ? rows.slice(0, limit) : rows;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Batter</th>
            <th className="px-3 py-2 text-right">R</th>
            <th className="px-3 py-2 text-right">B</th>
            <th className="hidden px-3 py-2 text-right sm:table-cell">4s</th>
            <th className="hidden px-3 py-2 text-right sm:table-cell">6s</th>
            <th className="px-3 py-2 text-right">SR</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                No balls bowled yet
              </td>
            </tr>
          )}
          {visible.map((b) => {
            const isStriker = b.playerId === strikerId;
            const isNonStriker = b.playerId === nonStrikerId;
            const sr = b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '0.0';
            const out = b.isOut ? '' : ' (not out)';
            const marker = isStriker ? '* ' : isNonStriker ? '  ' : '';
            return (
              <tr key={b.playerId} className="border-t border-border">
                <td className="px-3 py-2">
                  {marker}
                  {playerNames[b.playerId] ?? b.playerId.slice(0, 6)}
                  <span className="text-muted-foreground">{out}</span>
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{b.runs}</td>
                <td className="px-3 py-2 text-right tabular-nums">{b.balls}</td>
                <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{b.fours}</td>
                <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{b.sixes}</td>
                <td className="px-3 py-2 text-right tabular-nums">{sr}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}