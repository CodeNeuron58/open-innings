import type { BatsmanStats } from '@/lib/scoring';
import { cn } from '@/lib/utils';

type Props = {
  batting: Record<string, BatsmanStats>;
  strikerId?: string;
  nonStrikerId?: string;
  playerNames: Record<string, string>;
  /** Max batter order shown (skip retired-not-out etc). */
  limit?: number;
};

const dismissalLabels: Record<string, string> = {
  bowled: 'b',
  caught: 'c',
  caught_behind: 'c †',
  lbw: 'lbw',
  run_out: 'run out',
  stumped: 'st',
  hit_wicket: 'hit wicket',
  retired_hurt: 'retired hurt',
  retired_out: 'retired out',
};

export function BattingCard({ batting, strikerId, nonStrikerId, playerNames, limit }: Props) {
  // JS preserves insertion order on Object.keys — `batting` was built up as
  // batters faced their first ball, so this gives us batting-order for free.
  const rows = Object.values(batting);
  const visible = limit ? rows.slice(0, limit) : rows;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 text-left font-medium">Batter</th>
            <th className="px-3 py-2.5 text-right font-medium">R</th>
            <th className="px-3 py-2.5 text-right font-medium">B</th>
            <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">4s</th>
            <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">6s</th>
            <th className="px-3 py-2.5 text-right font-medium">SR</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {visible.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                No balls bowled yet
              </td>
            </tr>
          )}
          {visible.map((b) => {
            const isStriker = b.playerId === strikerId;
            const isNonStriker = b.playerId === nonStrikerId;
            const atCrease = isStriker || isNonStriker;
            const sr = b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '0.0';
            const status = b.isOut
              ? (dismissalLabels[b.dismissalType ?? ''] ?? 'out')
              : 'not out';
            return (
              <tr key={b.playerId} className={cn(atCrease && 'bg-accent/30')}>
                <td className="px-3 py-2.5">
                  <span className={cn('font-medium', atCrease && 'text-foreground')}>
                    {playerNames[b.playerId] ?? b.playerId.slice(0, 6)}
                    {isStriker && <span aria-label="on strike"> *</span>}
                  </span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{status}</span>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{b.runs}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {b.balls}
                </td>
                <td className="hidden px-3 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">
                  {b.fours}
                </td>
                <td className="hidden px-3 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">
                  {b.sixes}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{sr}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
