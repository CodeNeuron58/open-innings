/**
 * What one player's match card draws, independent of the shape it is drawn in.
 *
 * Two cards render this — the landscape a link unfurls into and the square
 * that gets sent as an image — and computing it twice is how one ends up
 * showing a different strike rate than the other.
 */
import 'server-only';
import { playerMatchLineFor } from '@/lib/services/match-summary';

export type PlayerCardContent = {
  name: string;
  /** "Koramangala XI v Whitefield CC". Empty when only one side is known. */
  fixture: string;
  /** "47(28) & 2-19" — the line a player would text a friend. */
  headline: string;
  status: string;
  isDone: boolean;
  stats: { value: string; label: string }[];
};

export async function playerCardContent(
  matchId: string,
  playerId: string,
): Promise<PlayerCardContent> {
  let name = 'Player';
  let fixture = '';
  let headline = '';
  let status = 'scheduled';
  let isDone = false;
  const stats: PlayerCardContent['stats'] = [];

  try {
    const p = await playerMatchLineFor(matchId, playerId);
    name = p.name;
    fixture = p.fixture ?? '';
    headline = p.line;
    status = p.status;
    isDone = p.isDone;

    if (p.batting) {
      stats.push({
        value: `${p.batting.runs}${p.batting.notOut ? '*' : ''}`,
        label: `off ${p.batting.balls}`,
      });
      // Only when there were some. "0×4 0×6" is a worse sentence than silence.
      if (p.batting.fours + p.batting.sixes > 0) {
        stats.push({ value: `${p.batting.fours}×4  ${p.batting.sixes}×6`, label: 'Boundaries' });
      }
      if (p.batting.strikeRate !== null) {
        stats.push({ value: p.batting.strikeRate.toFixed(0), label: 'Strike rate' });
      }
    }
    if (p.bowling && p.bowling.wickets > 0) {
      stats.push({ value: `${p.bowling.wickets}-${p.bowling.runs}`, label: 'Bowling' });
    }
  } catch {
    // A deleted match still returns branding rather than a broken image — the
    // link outlives the data and gets re-shared.
    headline = 'Match performance';
  }

  return { name, fixture, headline, status, isDone, stats };
}
