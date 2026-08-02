import type { BowlerStats } from '@/lib/scoring';

type Props = {
  bowling: Record<string, BowlerStats>;
  playerNames: Record<string, string>;
};

export function BowlingCard({ bowling, playerNames }: Props) {
  const rows = Object.values(bowling).sort((a, b) => a.balls - b.balls);

  return (
    <div className="border-border bg-card shadow-card overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-border text-muted-foreground border-b text-xs uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2.5 text-left font-medium">Bowler</th>
            <th className="px-3 py-2.5 text-right font-medium">O</th>
            <th className="px-3 py-2.5 text-right font-medium">M</th>
            <th className="px-3 py-2.5 text-right font-medium">R</th>
            <th className="px-3 py-2.5 text-right font-medium">W</th>
            <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Econ</th>
          </tr>
        </thead>
        <tbody className="divide-border/60 divide-y">
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="text-muted-foreground px-3 py-6 text-center">
                No bowlers yet
              </td>
            </tr>
          )}
          {rows.map((bw) => {
            const overs = `${Math.floor(bw.balls / 6)}.${bw.balls % 6}`;
            const er = bw.balls > 0 ? ((bw.runs / bw.balls) * 6).toFixed(2) : '0.00';
            return (
              <tr key={bw.playerId}>
                <td className="px-3 py-2.5 font-medium">
                  {playerNames[bw.playerId] ?? bw.playerId.slice(0, 6)}
                </td>
                <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">
                  {overs}
                </td>
                <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">
                  {bw.maidens}
                </td>
                <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">
                  {bw.runs}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{bw.wickets}</td>
                <td className="text-muted-foreground hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">
                  {er}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
