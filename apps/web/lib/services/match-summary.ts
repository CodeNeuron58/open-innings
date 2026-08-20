/**
 * A match reduced to summary facts for a share card.
 * Replayed entirely from `ball_events` to ensure correctness after corrections.
 */
import 'server-only';
import {
  replayInnings,
  buildScorecard,
  asInningsId,
  asPlayerId,
  type MatchState,
} from '@open-innings/scoring';
import {
  getMatch,
  getInnings,
  getTeam,
  listBallEvents,
  getPlayerNamesByIds,
} from '@/lib/db/queries';
import { notFound } from './errors';
import { getUserId } from '@/lib/auth/local';

/**
 * Whether the caller is the person who scored this match.
 *
 * These two endpoints are public — anyone with the link gets the card — but
 * the mobile client sends its token anyway, so a signed-in scorer is
 * identifiable and an anonymous viewer resolves to `false`. That is the whole
 * distinction the ad policy rests on: `lib/ads.ts` and `FEATURES.md` both say
 * the person who did the work never sees an ad, and until now nothing in the
 * response let the client tell who that was.
 *
 * Not authorization. Nothing is withheld on the strength of it, so a wrong
 * answer costs an ad impression, not a leak.
 */
async function isScorer(createdBy: string | null): Promise<boolean> {
  if (!createdBy) return false;
  const userId = await getUserId();
  return userId !== null && userId === createdBy;
}

export type Performer = {
  playerId: string;
  name: string;
  /**
   * Batting: runs and balls. Bowling: wickets and runs conceded. Sixes: the
   * count and the balls faced.
   *
   * The pair is always "the figure that ranks them" then "the tiebreaker",
   * which is why one type serves all three.
   */
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
   * Most sixes. Not a statistic anyone's average depends on, and included
   * anyway: it is the thing people actually bring up afterwards, and a card
   * that only ever names the top scorer names the same person every time.
   */
  mostSixes: Performer | null;
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
  /**
   * The scores are level and a super over can be opened.
   *
   * Answered here rather than left to the client, because the rule belongs to
   * the server — `startNextInnings` refuses innings 3 unless the match is
   * tied, and a button offering something the API will reject is worse than no
   * button at all.
   */
  canStartSuperOver: boolean;
  /** True when the caller scored this match. Drives ad suppression, nothing else. */
  isMine: boolean;
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
          // Null in the row means the match set no limit; the engine reads
          // undefined as unenforced. Replay must see the same condition the
          // delivery was validated under, or a lawfully-scored innings stops
          // replaying.
          maxOversPerBowler: match.maxOversPerBowler ?? undefined,
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

  // Fielders too, not just people who batted or bowled. A specialist fielder
  // who takes a catch appears in neither map, and "caught by Unknown" on a
  // scorecard is worse than no name at all.
  const fielderIds = states.flatMap((s) =>
    s.balls.flatMap((b) =>
      [b.fielderId, b.wicketPlayerId].filter((v): v is NonNullable<typeof v> => v !== undefined),
    ),
  );

  const names = await getPlayerNamesByIds([
    ...new Set([...batting.keys(), ...bowling.keys(), ...fielderIds.map(String)]),
  ]);
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

  // Most sixes, tie broken on fewer balls faced — three off ten deliveries
  // was a better evening than three off fifty.
  let mostSixes: Performer | null = null;
  for (const [id, s] of batting) {
    if (s.sixes === 0) continue;
    if (
      !mostSixes ||
      s.sixes > mostSixes.primary ||
      (s.sixes === mostSixes.primary && s.balls < mostSixes.secondary)
    ) {
      mostSixes = { playerId: id, name: nameOf(id), primary: s.sixes, secondary: s.balls };
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
    mostSixes,
    playerOfTheMatch: potm,
    // Only after a completed second innings: innings 3 and 4 are the super
    // over itself, and a tie there needs another one, which is not supported.
    canStartSuperOver: match.result === 'tie' && allInnings.length === 2,
    isMine: await isScorer(match.createdBy),
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

// ─────────────────────────────────────────────────────────────────────────────
// The full card
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every innings, in full — both tables, the extras, the fall of wickets and
 * every delivery.
 *
 * Separate from `matchSummaryFor` because the two answer different questions.
 * A summary is what you put on a card; this is the record, and it is the
 * heavier call — it ships every ball of the match. The card screen asks for it
 * once and then switches tabs locally.
 *
 * Deliveries come back oldest-first, exactly as bowled. Grouping them into
 * overs and reversing for display is the client's business, and
 * `groupIntoOvers` in the engine does it for whoever asks.
 */
export type CardDelivery = {
  overNumber: number;
  ballNumber: number;
  eventType: string;
  runsOffBat: number;
  extraRuns: number;
  totalRuns: number;
  isLegalDelivery: boolean;
  batsmanName: string;
  bowlerName: string;
  wicketType: string | null;
  outBatterName: string | null;
  fielderName: string | null;
  commentary: string | null;
};

export type CardInnings = {
  inningsNumber: number;
  battingTeamName: string;
  bowlingTeamName: string;
  runs: number;
  wickets: number;
  overs: string;
  target: number | null;
  batting: {
    playerId: string;
    playerName: string;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    strikeRate: string;
    isOut: boolean;
    dismissalText: string | null;
  }[];
  bowling: {
    playerId: string;
    playerName: string;
    overs: string;
    maidens: number;
    runs: number;
    wickets: number;
    economy: string;
  }[];
  /**
   * Broken out rather than a single total, because a scorer checking the book
   * against the app checks these individually — a byes column that disagrees
   * is the usual sign something was entered on the wrong key.
   */
  extras: { total: number; wides: number; noBalls: number; byes: number; legByes: number };
  fallOfWickets: { wicketNumber: number; runsAtFall: number; oversAtFall: string; name: string }[];
  deliveries: CardDelivery[];
};

export type MatchCard = {
  matchId: string;
  title: string | null;
  venue: string | null;
  status: string;
  result: string | null;
  innings: CardInnings[];
  /** True when the caller scored this match. Drives ad suppression, nothing else. */
  isMine: boolean;
};

export async function matchCardFor(matchId: string): Promise<MatchCard> {
  const { match, allInnings, states, teamNames, nameOf } = await aggregate(matchId);

  const innings: CardInnings[] = allInnings.map((inn, i) => {
    const state = states[i];
    if (!state) {
      throw notFound('Innings could not be replayed');
    }
    const card = buildScorecard(state, nameOf);

    // Extras by kind, folded from the ball log. The engine tracks wides and
    // no-balls per bowler but byes and leg-byes belong to nobody, so the
    // deliveries are the only place all four agree.
    const extras = {
      total: state.currentInnings.extras,
      wides: 0,
      noBalls: 0,
      byes: 0,
      legByes: 0,
    };
    for (const b of state.balls) {
      if (b.eventType === 'wide') extras.wides += b.totalRuns;
      else if (b.eventType === 'no_ball') extras.noBalls += b.totalRuns;
      else if (b.eventType === 'bye') extras.byes += b.totalRuns;
      else if (b.eventType === 'leg_bye') extras.legByes += b.totalRuns;
    }

    return {
      inningsNumber: inn.inningsNumber,
      battingTeamName: teamNames.get(inn.battingTeamId) ?? 'Team',
      bowlingTeamName: teamNames.get(inn.bowlingTeamId) ?? 'Team',
      runs: state.currentInnings.runs,
      wickets: state.currentInnings.wickets,
      overs: oversOf(state.currentInnings.ballsBowled),
      target: inn.target ?? null,
      // Someone who never faced a ball and never came in is not on the card.
      batting: card.batting
        .filter((b) => b.balls > 0 || b.isOut)
        .map((b) => ({
          playerId: b.playerId,
          playerName: b.playerName,
          runs: b.runs,
          balls: b.balls,
          fours: b.fours,
          sixes: b.sixes,
          strikeRate: b.strikeRate,
          isOut: b.isOut,
          dismissalText: b.dismissalText ?? null,
        })),
      bowling: card.bowling
        .filter((b) => b.overs !== '0.0')
        .map((b) => ({
          playerId: b.playerId,
          playerName: b.playerName,
          overs: b.overs,
          maidens: b.maidens,
          runs: b.runs,
          wickets: b.wickets,
          economy: b.economy,
        })),
      extras,
      fallOfWickets: card.fallOfWickets.map((f) => ({
        wicketNumber: f.wicketNumber,
        runsAtFall: f.runsAtFall,
        oversAtFall: f.oversAtFall,
        name: f.batsmanOutName,
      })),
      deliveries: state.balls.map((b) => ({
        overNumber: b.overNumber,
        ballNumber: b.ballNumber,
        eventType: b.eventType,
        runsOffBat: b.runsOffBat,
        extraRuns: b.extraRuns,
        totalRuns: b.totalRuns,
        isLegalDelivery: b.isLegalDelivery,
        batsmanName: nameOf(String(b.batsmanId)),
        bowlerName: nameOf(String(b.bowlerId)),
        wicketType: b.wicketType ?? null,
        outBatterName: b.wicketPlayerId ? nameOf(String(b.wicketPlayerId)) : null,
        fielderName: b.fielderId ? nameOf(String(b.fielderId)) : null,
        commentary: b.commentary ?? null,
      })),
    };
  });

  return {
    matchId: match.id,
    title: match.title,
    venue: match.venue,
    status: match.status,
    result: match.summary,
    innings,
    isMine: await isScorer(match.createdBy),
  };
}
