/**
 * A match reduced to the handful of facts worth putting on a share card.
 *
 * The public scorecard at /m/[matchId] is the full record. This is what a
 * person actually recounts afterwards: the result, who made the runs, who took
 * the wickets, and who won it. One small object, so the card renderer and
 * anything else that summarises a match agree on what "top scorer" means.
 *
 * Everything is replayed from `ball_events` through the scoring engine —
 * never read from a stored aggregate — for the same reason career stats are:
 * correcting a ball must correct everything downstream of it.
 */
import 'server-only';
import { replayInnings, asInningsId, asPlayerId, type MatchState } from '@open-innings/scoring';
import {
  getMatch,
  getInnings,
  getTeam,
  listBallEvents,
  getPlayerNamesByIds,
} from '@/lib/db/queries';
import { notFound } from './errors';

export type Performer = {
  playerId: string;
  name: string;
  /** Batting: runs and balls. Bowling: wickets and runs conceded. */
  primary: number;
  secondary: number;
};

export type MatchSummary = {
  matchId: string;
  title: string | null;
  venue: string | null;
  status: string;
  /** "Belonia Strikers won by 4 wickets" — the server's own result line. */
  result: string | null;
  innings: { teamName: string; runs: number; wickets: number; overs: string }[];
  topScorer: Performer | null;
  bestBowler: Performer | null;
  /**
   * Player of the match.
   *
   * Deliberately a transparent heuristic rather than a stored choice: runs
   * plus twenty per wicket, which is the rough exchange rate club cricketers
   * already use when they argue about it. A fifty and a three-for come out
   * level, which is about right.
   *
   * It is not an award anyone voted on, and it should never be presented as
   * one — it is "who had the biggest game", computed.
   */
  playerOfTheMatch: { playerId: string; name: string; line: string } | null;
};

function oversOf(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

type BallRow = Awaited<ReturnType<typeof listBallEvents>>[number];

/** DB rows → engine event inputs: branded ids, null → undefined. */
function toEvents(rows: BallRow[]) {
  return rows.map((row) => ({
    ...row,
    inningsId: asInningsId(row.inningsId),
    batsmanId: asPlayerId(row.batsmanId),
    nonStrikerId: asPlayerId(row.nonStrikerId),
    bowlerId: asPlayerId(row.bowlerId),
    wicketPlayerId: row.wicketPlayerId ? asPlayerId(row.wicketPlayerId) : undefined,
    fielderId: row.fielderId ? asPlayerId(row.fielderId) : undefined,
    wicketType: row.wicketType ?? undefined,
    commentary: row.commentary ?? undefined,
  }));
}

/**
 * Loads a match and folds every ball into per-player batting and bowling
 * totals across both innings.
 *
 * Extracted because the match card and the per-player card need exactly the
 * same work — and if they computed it separately, "47(28)" on one could
 * disagree with "47(28)" on the other.
 */
async function aggregate(matchId: string) {
  const match = await getMatch(matchId);
  if (!match) throw notFound('Match not found');

  const allInnings = await getInnings(matchId);

  // Replay every innings, not just the current one — a share card is made
  // after the match, so both sides matter.
  const states: MatchState[] = [];
  for (const inn of allInnings) {
    const balls = await listBallEvents(inn.id);
    states.push(
      replayInnings(
        {
          matchId: match.id,
          oversPerInnings: match.oversPerInnings,
          teamAId: match.teamAId,
          teamBId: match.teamBId,
          battingTeamId: inn.battingTeamId,
          bowlingTeamId: inn.bowlingTeamId,
          inningsId: inn.id,
          inningsNumber: inn.inningsNumber as 1 | 2 | 3 | 4,
          // Empty string rather than undefined: an innings that never opened
          // has no striker, and the engine reads that as "not yet set".
          strikerId: inn.openingStrikerId ?? '',
          nonStrikerId: inn.openingNonStrikerId ?? '',
          bowlerId: inn.openingBowlerId ?? '',
          maxWickets: inn.maxWickets,
          target: inn.target ?? undefined,
        },
        toEvents(balls),
      ),
    );
  }

  const teamNames = new Map<string, string>();
  for (const id of new Set(allInnings.flatMap((i) => [i.battingTeamId, i.bowlingTeamId]))) {
    const team = await getTeam(id);
    if (team) teamNames.set(id, team.name);
  }

  // Aggregate across both innings. A player bats in one and bowls in the
  // other, so their contributions live in different states.
  const batting = new Map<
    string,
    { runs: number; balls: number; fours: number; sixes: number; isOut: boolean }
  >();
  const bowling = new Map<string, { wickets: number; runs: number; balls: number }>();

  for (const state of states) {
    for (const [id, s] of Object.entries(state.batting)) {
      const prev = batting.get(id) ?? { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false };
      batting.set(id, {
        runs: prev.runs + s.runs,
        balls: prev.balls + s.balls,
        fours: prev.fours + s.fours,
        sixes: prev.sixes + s.sixes,
        // Out in either innings counts — the asterisk belongs only to someone
        // who was never dismissed in this match.
        isOut: prev.isOut || s.isOut,
      });
    }
    for (const [id, s] of Object.entries(state.bowling)) {
      const prev = bowling.get(id) ?? { wickets: 0, runs: 0, balls: 0 };
      bowling.set(id, {
        wickets: prev.wickets + s.wickets,
        runs: prev.runs + s.runs,
        balls: prev.balls + s.balls,
      });
    }
  }

  const names = await getPlayerNamesByIds([...new Set([...batting.keys(), ...bowling.keys()])]);
  const nameOf = (id: string) => names[id] ?? 'Unknown';

  return { match, allInnings, states, teamNames, batting, bowling, nameOf };
}

export async function matchSummaryFor(matchId: string): Promise<MatchSummary> {
  const { match, allInnings, states, teamNames, batting, bowling, nameOf } =
    await aggregate(matchId);

  // Top scorer: most runs, then fewest balls — 40 off 20 beats 40 off 35.
  let topScorer: Performer | null = null;
  for (const [id, s] of batting) {
    if (s.runs === 0) continue;
    if (
      !topScorer ||
      s.runs > topScorer.primary ||
      (s.runs === topScorer.primary && s.balls < topScorer.secondary)
    ) {
      topScorer = { playerId: id, name: nameOf(id), primary: s.runs, secondary: s.balls };
    }
  }

  // Best bowler: most wickets, then fewest runs — 3-12 beats 3-40.
  let bestBowler: Performer | null = null;
  for (const [id, s] of bowling) {
    if (s.wickets === 0) continue;
    if (
      !bestBowler ||
      s.wickets > bestBowler.primary ||
      (s.wickets === bestBowler.primary && s.runs < bestBowler.secondary)
    ) {
      bestBowler = { playerId: id, name: nameOf(id), primary: s.wickets, secondary: s.runs };
    }
  }

  // Player of the match — see the note on the type.
  let potm: MatchSummary['playerOfTheMatch'] = null;
  let bestImpact = 0;
  for (const id of new Set([...batting.keys(), ...bowling.keys()])) {
    const bat = batting.get(id) ?? { runs: 0, balls: 0 };
    const bowl = bowling.get(id) ?? { wickets: 0, runs: 0 };
    const impact = bat.runs + bowl.wickets * 20;
    if (impact === 0 || impact <= bestImpact) continue;

    const parts: string[] = [];
    if (bat.runs > 0) parts.push(`${bat.runs}(${bat.balls})`);
    if (bowl.wickets > 0) parts.push(`${bowl.wickets}-${bowl.runs}`);

    bestImpact = impact;
    potm = { playerId: id, name: nameOf(id), line: parts.join(' & ') };
  }

  return {
    matchId: match.id,
    title: match.title,
    venue: match.venue,
    status: match.status,
    result: match.summary,
    innings: allInnings.map((inn, i) => ({
      teamName: teamNames.get(inn.battingTeamId) ?? 'Team',
      runs: states[i]?.currentInnings.runs ?? 0,
      wickets: states[i]?.currentInnings.wickets ?? 0,
      overs: oversOf(states[i]?.currentInnings.ballsBowled ?? 0),
    })),
    topScorer,
    bestBowler,
    playerOfTheMatch: potm,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// One player, one match
// ─────────────────────────────────────────────────────────────────────────────

export type PlayerMatchLine = {
  matchId: string;
  playerId: string;
  name: string;
  /** The two sides, for the header: "Belonia Strikers v Whitefield". */
  fixture: string | null;
  result: string | null;
  batting: {
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    notOut: boolean;
    strikeRate: number | null;
  } | null;
  bowling: { wickets: number; runs: number; balls: number; economy: number | null } | null;
  /** "47(28)" or "47(28) & 2-19" — the line a player would text a friend. */
  line: string;
};

/**
 * What one player did in one match.
 *
 * The point of this existing separately from the match card: a match produces
 * one shareable artifact, but it involved twenty-two people who each did
 * something different. Give each of them their own card and one match
 * produces twenty-two posts instead of one — which is the whole arithmetic
 * behind the share loop in FEATURES.md.
 */
export async function playerMatchLineFor(
  matchId: string,
  playerId: string,
): Promise<PlayerMatchLine> {
  const { match, allInnings, teamNames, batting, bowling, nameOf } = await aggregate(matchId);

  const bat = batting.get(playerId);
  const bowl = bowling.get(playerId);
  if (!bat && !bowl) throw notFound('That player did not play in this match');

  const sides = [...new Set(allInnings.map((i) => i.battingTeamId))]
    .map((id) => teamNames.get(id))
    .filter(Boolean);

  const parts: string[] = [];
  if (bat && bat.balls > 0) parts.push(`${bat.runs}${bat.isOut ? '' : '*'}(${bat.balls})`);
  if (bowl && bowl.wickets > 0) parts.push(`${bowl.wickets}-${bowl.runs}`);

  return {
    matchId: match.id,
    playerId,
    name: nameOf(playerId),
    fixture: sides.length >= 2 ? `${sides[0]} v ${sides[1]}` : (match.title ?? null),
    result: match.summary,
    // A player who came in and never faced a ball has no batting line to show.
    batting:
      bat && bat.balls > 0
        ? {
            runs: bat.runs,
            balls: bat.balls,
            fours: bat.fours,
            sixes: bat.sixes,
            notOut: !bat.isOut,
            strikeRate: bat.balls > 0 ? (bat.runs / bat.balls) * 100 : null,
          }
        : null,
    bowling:
      bowl && bowl.balls > 0
        ? {
            wickets: bowl.wickets,
            runs: bowl.runs,
            balls: bowl.balls,
            economy: bowl.balls > 0 ? bowl.runs / (bowl.balls / 6) : null,
          }
        : null,
    // Fielded but neither batted nor bowled — say so rather than showing "".
    line: parts.length > 0 ? parts.join(' & ') : 'Did not bat or bowl',
  };
}
