/**
 * What a match share card draws, independent of what shape it is drawn in.
 *
 * Two cards render this: the landscape 1200×630 that a link unfurls into, and
 * the 1080 square that gets sent as an image. They are different layouts of
 * the same facts, and computing those facts twice is how one ends up naming a
 * different player of the match than the other.
 */
import 'server-only';
import { matchSummaryFor } from '@/lib/services/match-summary';

export type MatchCardContent = {
  /** "Koramangala XI v Whitefield CC" — the fixture. */
  heading: string;
  /** The server's own result line, or "In progress". Never invented here. */
  result: string;
  lines: { team: string; score: string }[];
  performers: { label: string; value: string }[];
};

export async function matchCardContent(matchId: string): Promise<MatchCardContent> {
  let heading = 'Match';
  let result = '';
  let lines: MatchCardContent['lines'] = [];
  const performers: MatchCardContent['performers'] = [];

  try {
    const s = await matchSummaryFor(matchId);

    lines = s.innings.map((i) => ({
      team: i.teamName,
      score: `${i.runs}-${i.wickets} (${i.overs})`,
    }));

    // Both sides named once the chase has opened; before that there is only
    // one innings and the match title is the best available label.
    const [first, second] = s.innings;
    heading =
      first && second
        ? `${first.teamName} v ${second.teamName}`
        : (s.title ?? first?.teamName ?? 'Match');

    // The server's own line, so a card never invents a verdict the scorecard
    // would disagree with.
    result = s.result ?? (s.status === 'completed' ? '' : 'In progress');

    if (s.topScorer) {
      performers.push({
        label: 'Top scorer',
        value: `${s.topScorer.name}  ${s.topScorer.primary}(${s.topScorer.secondary})`,
      });
    }
    if (s.bestBowler) {
      performers.push({
        label: 'Best bowling',
        value: `${s.bestBowler.name}  ${s.bestBowler.primary}-${s.bestBowler.secondary}`,
      });
    }

    /*
     * Player of the match only once the match is finished. Naming one
     * mid-innings would be wrong twice over: the game can still turn, and it
     * would read as a verdict when it is a computed heuristic. Suppressed
     * when it would only repeat a name already beside it.
     */
    if (
      s.status === 'completed' &&
      s.playerOfTheMatch &&
      s.playerOfTheMatch.playerId !== s.topScorer?.playerId &&
      s.playerOfTheMatch.playerId !== s.bestBowler?.playerId
    ) {
      performers.push({
        label: 'Player of the match',
        value: `${s.playerOfTheMatch.name}  ${s.playerOfTheMatch.line}`,
      });
    }
  } catch {
    // A deleted match still returns branding rather than a broken image — the
    // link outlives the data and gets re-shared.
    result = 'Scorecard';
  }

  return { heading, result, lines, performers };
}
