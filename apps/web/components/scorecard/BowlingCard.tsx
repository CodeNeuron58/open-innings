import type { BowlerStats } from '@/lib/scoring';

type Props = {
  bowling: Record<string, BowlerStats>;
  playerNames: Record<string, string>;
};

export function BowlingCard({ bowling, playerNames }: Props) {
  const rows = Object.values(bowling).sort((a, b) => a.balls - b.balls);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Bowler</th>
            <th className="px-3 py-2 text-right">O</th>
            <th className="px-3 py-2 text-right">M</th>
            <th className="px-3 py-2 text-right">R</th>
            <th className="px-3 py-2 text-right">W</th>
            <th className="hidden px-3 py-2 text-right sm:table-cell">ER</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                No bowlers yet
              </td>
            </tr>
          )}
          {rows.map((bw) => {
            const overs = `${Math.floor(bw.balls / 6)}.${bw.balls % 6}`;
            const er = bw.balls > 0 ? ((bw.runs / bw.balls) * 6).toFixed(2) : '0.00';
            return (
              <tr key={bw.playerId} className="border-t border-border">
                <td className="px-3 py-2">{playerNames[bw.playerId] ?? bw.playerId.slice(0, 6)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{overs}</td>
                <td className="px-3 py-2 text-right tabular-nums">{bw.maidens}</td>
                <td className="px-3 py-2 text-right tabular-nums">{bw.runs}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{bw.wickets}</td>
                <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{er}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}