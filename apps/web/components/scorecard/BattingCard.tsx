import type { BatsmanStats } from '@open-innings/scoring';
import { cn } from '@/lib/utils';

type Props = {
  batting: Record<string, BatsmanStats>;
  strikerId?: string;
  nonStrikerId?: string;
  playerNames: Record<string, string>;
  /** Max batter order shown (skip retired-not-out etc). */
  limit?: number;
};

function getDismissalText(b: BatsmanStats, playerNames: Record<string, string>): string {
  if (b.isRetiredHurt) return 'retired hurt';
  if (!b.isOut) return 'not out';
  if (!b.dismissalType) return 'out';

  const bowler = b.dismissedByPlayerId
    ? (playerNames[b.dismissedByPlayerId as unknown as string] ?? b.dismissedByPlayerId.slice(0, 6))
    : undefined;
  const fielder = b.fielderId
    ? (playerNames[b.fielderId as unknown as string] ?? b.fielderId.slice(0, 6))
    : undefined;

  switch (b.dismissalType) {
    case 'bowled':
      return `b ${bowler ?? '?'}`;
    case 'caught':
      return `c ${fielder ?? '?'} b ${bowler ?? '?'}`;
    case 'caught_behind':
      return `c †${fielder ?? '?'} b ${bowler ?? '?'}`;
    case 'lbw':
      return `lbw b ${bowler ?? '?'}`;
    case 'run_out':
      return `run out${fielder ? ` (${fielder})` : ''}`;
    case 'stumped':
      return `st †${fielder ?? '?'} b ${bowler ?? '?'}`;
    case 'hit_wicket':
      return `hit wicket b ${bowler ?? '?'}`;
    case 'retired_hurt':
      return 'retired hurt';
    case 'retired_out':
      return 'retired out';
    case 'handled_ball':
    case 'obstructing_field':
    case 'timed_out':
    case 'double_hit':
    case 'hit_the_ball_twice':
      return b.dismissalType.replace(/_/g, ' ');
    default:
      return 'out';
  }
}

export function BattingCard({ batting, strikerId, nonStrikerId, playerNames, limit }: Props) {
  // JS preserves insertion order on Object.keys — `batting` was built up as
  // batters faced their first ball, so this gives us batting-order for free.
  const rows = Object.values(batting);
  const visible = limit ? rows.slice(0, limit) : rows;

  return (
    <div className="border-border bg-card shadow-card overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-border text-muted-foreground border-b text-xs uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2.5 text-left font-medium">Batter</th>
            <th className="px-3 py-2.5 text-right font-medium">R</th>
            <th className="px-3 py-2.5 text-right font-medium">B</th>
            <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">4s</th>
            <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">6s</th>
            <th className="px-3 py-2.5 text-right font-medium">SR</th>
          </tr>
        </thead>
        <tbody className="divide-border/60 divide-y">
          {visible.length === 0 && (
            <tr>
              <td colSpan={6} className="text-muted-foreground px-3 py-6 text-center">
                No balls bowled yet
              </td>
            </tr>
          )}
          {visible.map((b) => {
            const isStriker = b.playerId === strikerId;
            const isNonStriker = b.playerId === nonStrikerId;
            const atCrease = isStriker || isNonStriker;
            const sr = b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '0.0';
            const status = getDismissalText(b, playerNames);
            return (
              <tr key={b.playerId} className={cn(atCrease && 'bg-accent/30')}>
                <td className="px-3 py-2.5">
                  <span className={cn('font-medium', atCrease && 'text-foreground')}>
                    {playerNames[b.playerId] ?? b.playerId.slice(0, 6)}
                    {isStriker && <span aria-label="on strike"> *</span>}
                  </span>
                  <span className="text-muted-foreground ml-1.5 text-xs">{status}</span>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{b.runs}</td>
                <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">
                  {b.balls}
                </td>
                <td className="text-muted-foreground hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">
                  {b.fours}
                </td>
                <td className="text-muted-foreground hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">
                  {b.sixes}
                </td>
                <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">{sr}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
