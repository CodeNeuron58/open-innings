import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, ChevronDown } from 'lucide-react';
import {
  loadMatchInProgress,
  getTeam,
  getInnings,
  listBallEvents,
  getPlayerNamesByIds,
} from '@/lib/db/queries';
import { formatOvers } from '@/lib/utils';
import { replayInnings, asInningsId, asPlayerId, type MatchState } from '@open-innings/scoring';
import type { Innings } from '@/lib/db/schema';
import { BattingCard } from '@/components/scorecard/BattingCard';
import { BowlingCard } from '@/components/scorecard/BowlingCard';
import { LiveRefresh } from '@/components/scorecard/LiveRefresh';
import { countWatching } from '@/lib/services/watching';
import { BallChip } from '@/components/BallChip';
import { Logo, LiveBadge, Badge, ButtonLink } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Props = { params: Promise<{ matchId: string }> };

type BallRow = Awaited<ReturnType<typeof listBallEvents>>[number];

/**
 * What an innings is called.
 *
 * Innings 3 and 4 are a Super Over — one over a side, two wickets — and
 * "Innings 3" describes neither the length nor why it is being played. The
 * engine has always known the difference; this page was printing the number.
 */
function inningsLabel(inningsNumber: number): string {
  if (inningsNumber === 1) return '1st innings';
  if (inningsNumber === 2) return '2nd innings';
  if (inningsNumber === 3) return 'Super Over';
  return 'Super Over — chase';
}

/** DB rows → engine event inputs (branded ids, null → undefined). */
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

function replayInningsRow(
  match: {
    id: string;
    oversPerInnings: number;
    teamAId: string;
    teamBId: string;
    maxOversPerBowler: number | null;
  },
  inn: Innings,
  rows: BallRow[],
): MatchState {
  return replayInnings(
    {
      matchId: match.id,
      oversPerInnings: match.oversPerInnings,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      battingTeamId: inn.battingTeamId,
      bowlingTeamId: inn.bowlingTeamId,
      inningsId: inn.id,
      inningsNumber: inn.inningsNumber as 1 | 2 | 3 | 4,
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
    toEvents(rows),
  );
}

function getInningsExtras(state: MatchState) {
  const extras = {
    total: state.currentInnings.extras,
    wides: 0,
    noBalls: 0,
    byes: 0,
    legByes: 0,
    penalty: 0,
  };
  for (const b of state.balls) {
    if (b.eventType === 'wide') extras.wides += b.totalRuns;
    else if (b.eventType === 'no_ball') extras.noBalls += b.totalRuns;
    else if (b.eventType === 'bye') extras.byes += b.totalRuns;
    else if (b.eventType === 'leg_bye') extras.legByes += b.totalRuns;
    else if (b.eventType === 'penalty') extras.penalty += b.totalRuns;
  }
  const parts = [
    extras.wides > 0 ? `wd ${extras.wides}` : null,
    extras.noBalls > 0 ? `nb ${extras.noBalls}` : null,
    extras.byes > 0 ? `b ${extras.byes}` : null,
    extras.legByes > 0 ? `lb ${extras.legByes}` : null,
    extras.penalty > 0 ? `pen ${extras.penalty}` : null,
  ].filter(Boolean);
  return { ...extras, parts };
}

function InningsExtrasAndFow({
  state,
  playerNames,
}: {
  state: MatchState;
  playerNames: Record<string, string>;
}) {
  const extras = getInningsExtras(state);
  const fow = state.fallOfWickets;

  return (
    <div className="border-border bg-card shadow-card mt-4 rounded-lg border p-4 text-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-muted-foreground font-semibold uppercase tracking-wide">Extras</span>
        <span className="font-medium">
          {extras.total}
          {extras.parts.length > 0 && (
            <span className="text-muted-foreground ml-1.5 font-normal">({extras.parts.join(', ')})</span>
          )}
        </span>
      </div>

      {fow.length > 0 && (
        <div className="border-border mt-3 border-t pt-2.5">
          <span className="text-muted-foreground font-semibold uppercase tracking-wide">
            Fall of wickets
          </span>
          <p className="text-muted-foreground mt-1 leading-relaxed">
            {fow
              .map(
                (f) =>
                  `${f.wicketNumber}–${f.runs} (${playerNames[f.batsmanOutId] ?? f.batsmanOutId.slice(0, 6)}, ${formatOvers(f.ballsBowled)} ov)`,
              )
              .join('  ·  ')}
          </p>
        </div>
      )}
    </div>
  );
}

export default async function PublicScorecardPage({ params }: Props) {
  const { matchId } = await params;
  const data = await loadMatchInProgress(matchId).catch(() => null);
  if (!data) notFound();

  const { match, currentInnings: inning, balls } = data;

  const state = replayInningsRow(match, inning, balls);

  const [teamA, teamB, allInnings] = await Promise.all([
    getTeam(match.teamAId).catch(() => null),
    getTeam(match.teamBId).catch(() => null),
    getInnings(matchId).catch(() => []),
  ]);
  const priorInnings = allInnings.filter((i) => i.inningsNumber < inning.inningsNumber);

  /*
   * A match ends two ways, and this page only knew about one.
   *
   * `abandoned` is a real outcome — rain, a dispute, a match that should not
   * have been started — and it was falling through to the innings-break badge,
   * so a finished match read as though it were about to resume. Worse, the
   * result line is gated on this, so "Match abandoned — Rain" was written to
   * the database, rendered on the share card, and never shown on the page the
   * card links to.
   */
  const matchAbandoned = match.status === 'abandoned';
  const matchDone = match.status === 'completed' || matchAbandoned;

  const priorBalls = await Promise.all(
    priorInnings.map((i) => listBallEvents(i.id).catch(() => [])),
  );
  const priorStates = priorInnings.map((i, idx) => replayInningsRow(match, i, priorBalls[idx]!));

  // Resolve every player id (across every innings) to a name.
  const playerIds = Array.from(
    new Set(
      [
        ...Object.keys(state.batting),
        ...Object.keys(state.bowling),
        inning.openingStrikerId ?? '',
        inning.openingNonStrikerId ?? '',
        inning.openingBowlerId ?? '',
        ...priorStates.flatMap((s) => [...Object.keys(s.batting), ...Object.keys(s.bowling)]),
      ].filter(Boolean),
    ),
  );
  const playerNames = await getPlayerNamesByIds(playerIds);

  const inn = state.currentInnings;
  const battingTeam = inn.battingTeamId === match.teamAId ? teamA : teamB;
  const bowlingTeam = inn.bowlingTeamId === match.teamAId ? teamA : teamB;
  const overs = `${Math.floor(inn.ballsBowled / 6)}.${inn.ballsBowled % 6}`;
  const rr = inn.ballsBowled > 0 ? ((inn.runs / inn.ballsBowled) * 6).toFixed(2) : '0.00';

  const isLive = inn.status === 'in_progress';

  // Presence, not subscription — see lib/services/watching.ts. Only asked for
  // while a match is live; a finished scorecard has nothing to watch.
  const watching = isLive ? await countWatching(match.id) : 0;
  // The innings' own length where it has one — a Super Over is one over inside
  // a twenty-over match, so the match figure overstates what is left.
  const totalBalls = (inn.oversPerInnings ?? match.oversPerInnings) * 6;
  const ballsLeft = Math.max(0, totalBalls - inn.ballsBowled);
  const runsNeeded = inn.target !== undefined ? Math.max(0, inn.target - inn.runs) : undefined;
  const reqRate =
    runsNeeded !== undefined && ballsLeft > 0 ? ((runsNeeded / ballsLeft) * 6).toFixed(2) : null;

  return (
    <div className="flex min-h-screen flex-col">
      {isLive && <LiveRefresh matchId={match.id} />}

      {/* Public top bar */}
      <header className="border-border bg-background/80 border-b backdrop-blur">
        <div className="container flex h-14 max-w-3xl items-center justify-between">
          <Link href="/" aria-label="Open Innings home">
            <Logo />
          </Link>
          {/* /signup does not exist on the web — scoring is the app, and this
              site is the landing page for it. Points at /app, same as the
              pinned bar at the foot of this page. */}
          <ButtonLink href="/app" size="sm" variant="outline">
            Score your own — free
          </ButtonLink>
        </div>
      </header>

      <main className="container max-w-3xl flex-1 py-6">
        {/* Scoreboard hero */}
        <section className="border-scoreboard-border bg-scoreboard text-scoreboard-text shadow-card overflow-hidden rounded-lg border">
          <div className="border-scoreboard-border flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {match.title ?? `${teamA?.name ?? 'Team A'} vs ${teamB?.name ?? 'Team B'}`}
              </p>
              <p className="text-scoreboard-muted mt-0.5 flex items-center gap-1 text-xs">
                {teamA?.name ?? 'Team A'} vs {teamB?.name ?? 'Team B'} ·{' '}
                {inn.inningsNumber >= 3 ? 'Super Over' : `${match.oversPerInnings} overs`}
                {match.venue && (
                  <>
                    {' · '}
                    <MapPin className="h-3 w-3" aria-hidden /> {match.venue}
                  </>
                )}
              </p>
            </div>
            {matchAbandoned ? (
              <Badge variant="secondary" className="bg-scoreboard-panel text-scoreboard-muted">
                Abandoned
              </Badge>
            ) : matchDone ? (
              <Badge variant="secondary" className="bg-scoreboard-panel text-scoreboard-accent">
                Result
              </Badge>
            ) : isLive ? (
              <LiveBadge />
            ) : inn.status === 'completed' ? (
              <Badge variant="secondary" className="bg-scoreboard-panel text-scoreboard-muted">
                Innings break
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-scoreboard-panel text-scoreboard-muted">
                Not started
              </Badge>
            )}
          </div>

          {matchDone && match.summary && (
            <div
              className={`border-scoreboard-border bg-scoreboard-panel/60 border-b px-5 py-2.5 text-sm font-semibold ${
                matchAbandoned ? 'text-scoreboard-muted' : 'text-scoreboard-accent'
              }`}
            >
              {/* No trophy on a washout. Nobody won it. */}
              {matchAbandoned ? '☂' : '🏆'} {match.summary}
            </div>
          )}

          <div className="px-5 py-6">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-scoreboard-muted truncate text-sm">
                  {battingTeam?.name ?? 'Batting'}
                </p>
                <p className="text-6xl font-bold tabular-nums tracking-tight">
                  {inn.runs}
                  <span className="text-scoreboard-muted">/</span>
                  {inn.wickets}
                </p>
              </div>
              <div className="text-scoreboard-muted pb-1 text-right text-sm">
                <p className="tabular-nums">
                  {overs} ov · CRR {rr}
                </p>
                <p className="mt-0.5 truncate">vs {bowlingTeam?.name ?? 'Bowling'}</p>
              </div>
            </div>
            {inn.target !== undefined && isLive && (
              <p className="text-scoreboard-accent mt-3 text-sm font-medium">
                Target {inn.target} · need {runsNeeded} off {ballsLeft}
                {reqRate ? ` · RRR ${reqRate}` : ''}
              </p>
            )}
          </div>

          {/* Recent balls */}
          {state.balls.length > 0 && (
            <div className="border-scoreboard-border flex items-center gap-1.5 overflow-x-auto border-t px-5 py-3">
              <span className="text-scoreboard-muted shrink-0 text-xs font-semibold uppercase tracking-wide">
                Recent
              </span>
              {state.balls.slice(-18).map((b, i) => (
                <BallChip key={i} ball={b} size="sm" />
              ))}
            </div>
          )}
        </section>

        {/* Batting + bowling side by side on desktop */}
        <section className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="text-muted-foreground mb-2 text-sm font-semibold uppercase tracking-wide">
              Batting
            </h2>
            <BattingCard
              batting={state.batting}
              strikerId={inn.strikerId as string}
              nonStrikerId={inn.nonStrikerId as string}
              playerNames={playerNames}
            />
          </div>
          <div>
            <h2 className="text-muted-foreground mb-2 text-sm font-semibold uppercase tracking-wide">
              Bowling
            </h2>
            <BowlingCard bowling={state.bowling} playerNames={playerNames} />
          </div>
        </section>

        {/* Current innings extras & fall of wickets */}
        <InningsExtrasAndFow state={state} playerNames={playerNames} />

        {/* Earlier innings — collapsed by default so the current innings stays the focus */}
        {priorInnings.map((i, idx) => {
          const priorTeam = i.battingTeamId === match.teamAId ? teamA : teamB;
          const priorState = priorStates[idx]!;
          const priorInn = priorState.currentInnings;
          return (
            <details
              key={i.id}
              className="border-border bg-card shadow-card group mt-4 overflow-hidden rounded-lg border"
            >
              <summary className="hover:bg-accent/40 flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 text-sm font-medium transition-colors">
                <span>
                  {inningsLabel(i.inningsNumber)}: {priorTeam?.name ?? 'Team'}{' '}
                  <span className="font-semibold">
                    {i.runs}/{i.wickets}
                  </span>{' '}
                  <span className="text-muted-foreground">({formatOvers(i.ballsBowled)} ov)</span>
                </span>
                <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-border border-t p-5">
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <h3 className="text-muted-foreground mb-2 text-sm font-semibold uppercase tracking-wide">
                      Batting
                    </h3>
                    <BattingCard
                      batting={priorState.batting}
                      strikerId={priorInn.strikerId as string}
                      nonStrikerId={priorInn.nonStrikerId as string}
                      playerNames={playerNames}
                    />
                  </div>
                  <div>
                    <h3 className="text-muted-foreground mb-2 text-sm font-semibold uppercase tracking-wide">
                      Bowling
                    </h3>
                    <BowlingCard bowling={priorState.bowling} playerNames={playerNames} />
                  </div>
                </div>
                <InningsExtrasAndFow state={priorState} playerNames={playerNames} />
              </div>
            </details>
          );
        })}

        {/*
          The reassurance, for someone who followed a WhatsApp link and is
          wondering what they have walked into.

          It is worth saying plainly because it is unusual and it is true:
          there is no wall, no account, and the page really does update as the
          scorer taps — LiveRefresh above is what makes that a statement of
          fact rather than a promise.

          The design puts a "Follow this match" button here. Nothing stores a
          follow and nothing counts followers, so it is not drawn — the live
          page already does what following would do.
        */}
        <div className="border-border mt-6 rounded-lg border border-dashed p-4 text-center">
          {/* "Watching", not "following" — this counts presence, not a
              subscription. Hidden below two so it never reads as "you are the
              only person here", which is discouraging and usually just means
              the count has not warmed up. */}
          {isLive && watching >= 2 ? (
            <p className="text-primary mb-2 text-xs font-semibold uppercase tracking-widest">
              {watching} watching now
            </p>
          ) : null}
          <p className="text-sm font-medium">No app, no account.</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {isLive
              ? 'This page updates itself as the scorer taps. Leave it open.'
              : 'This scorecard stays at this address permanently.'}
          </p>
        </div>
      </main>

      <footer className="border-border border-t py-6 pb-24">
        <div className="text-muted-foreground container flex max-w-3xl flex-col items-center gap-2 text-center text-xs">
          <p>
            Scored with{' '}
            <Link href="/" className="text-primary font-medium hover:underline">
              Open Innings
            </Link>{' '}
            — free, open-source cricket scoring. Forever.
          </p>
        </div>
      </footer>

      {/*
        The conversion bar, pinned.

        This page is the growth loop: someone opened it because a friend sent
        a scorecard, and this is the one moment they are looking at proof the
        thing works. A CTA in the header is above the fold and ignored; this
        one is in front of them at the moment they finish reading the score.

        `pb-24` on the footer above keeps the last line clear of it.
      */}
      <div className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-10 border-t backdrop-blur">
        <div className="container flex max-w-3xl items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Score your own club</p>
            <p className="text-muted-foreground truncate text-xs">
              Free, open source, and no ads while you score.
            </p>
          </div>
          {/*
            Points at the app page, not a Play listing — there isn't one yet.
            See docs/wiring.md.
          */}
          <ButtonLink href="/app" size="sm" className="shrink-0">
            Get the app
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
