import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin } from 'lucide-react';
import {
  loadMatchInProgress,
  getTeam,
  getPlayerNamesByIds,
} from '@/lib/db/queries';
import {
  replayInnings,
  asInningsId,
  asPlayerId,
} from '@/lib/scoring';
import { BattingCard } from '@/components/scorecard/BattingCard';
import { BowlingCard } from '@/components/scorecard/BowlingCard';
import { LiveRefresh } from '@/components/scorecard/LiveRefresh';
import { BallChip } from '@/components/BallChip';
import { Logo, LiveBadge, Badge, ButtonLink } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Props = { params: Promise<{ matchId: string }> };

export default async function PublicScorecardPage({ params }: Props) {
  const { matchId } = await params;
  const data = await loadMatchInProgress(matchId).catch(() => null);
  if (!data) notFound();

  const { match, currentInnings: inning, balls } = data;

  const events = balls.map((row) => ({
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

  const state = replayInnings(
    {
      matchId: match.id,
      oversPerInnings: match.oversPerInnings,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      battingTeamId: inning.battingTeamId,
      bowlingTeamId: inning.bowlingTeamId,
      inningsId: inning.id,
      inningsNumber: inning.inningsNumber as 1 | 2 | 3 | 4,
      strikerId: inning.openingStrikerId ?? '',
      nonStrikerId: inning.openingNonStrikerId ?? '',
      bowlerId: inning.openingBowlerId ?? '',
      maxWickets: inning.maxWickets,
      target: inning.target ?? undefined,
    },
    events,
  );

  const [teamA, teamB] = await Promise.all([
    getTeam(match.teamAId).catch(() => null),
    getTeam(match.teamBId).catch(() => null),
  ]);

  // Resolve every player id in the state to a name.
  const playerIds = Array.from(
    new Set([
      ...Object.keys(state.batting),
      ...Object.keys(state.bowling),
      inning.openingStrikerId ?? '',
      inning.openingNonStrikerId ?? '',
      inning.openingBowlerId ?? '',
    ].filter(Boolean)),
  );
  const playerNames = await getPlayerNamesByIds(playerIds);

  const inn = state.currentInnings;
  const battingTeam = inn.battingTeamId === match.teamAId ? teamA : teamB;
  const bowlingTeam = inn.bowlingTeamId === match.teamAId ? teamA : teamB;
  const overs = `${Math.floor(inn.ballsBowled / 6)}.${inn.ballsBowled % 6}`;
  const rr = inn.ballsBowled > 0 ? ((inn.runs / inn.ballsBowled) * 6).toFixed(2) : '0.00';

  const isLive = inn.status === 'in_progress';
  const totalBalls = match.oversPerInnings * 6;
  const ballsLeft = Math.max(0, totalBalls - inn.ballsBowled);
  const runsNeeded = inn.target !== undefined ? Math.max(0, inn.target - inn.runs) : undefined;
  const reqRate =
    runsNeeded !== undefined && ballsLeft > 0 ? ((runsNeeded / ballsLeft) * 6).toFixed(2) : null;

  return (
    <div className="flex min-h-screen flex-col">
      {isLive && <LiveRefresh />}

      {/* Public top bar */}
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="container flex h-14 max-w-3xl items-center justify-between">
          <Link href="/" aria-label="Open Innings home">
            <Logo />
          </Link>
          <ButtonLink href="/signup" size="sm" variant="outline">
            Score your own — free
          </ButtonLink>
        </div>
      </header>

      <main className="container max-w-3xl flex-1 py-6">
        {/* Scoreboard hero */}
        <section className="overflow-hidden rounded-lg border border-scoreboard-border bg-scoreboard text-scoreboard-text shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-scoreboard-border px-5 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {match.title ?? `${teamA?.name ?? 'Team A'} vs ${teamB?.name ?? 'Team B'}`}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-scoreboard-muted">
                {teamA?.name ?? 'Team A'} vs {teamB?.name ?? 'Team B'} · {match.oversPerInnings}{' '}
                overs
                {match.venue && (
                  <>
                    {' · '}
                    <MapPin className="h-3 w-3" aria-hidden /> {match.venue}
                  </>
                )}
              </p>
            </div>
            {isLive ? (
              <LiveBadge />
            ) : inn.status === 'completed' ? (
              <Badge variant="secondary" className="bg-scoreboard-panel text-scoreboard-muted">
                Innings complete
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-scoreboard-panel text-scoreboard-muted">
                Not started
              </Badge>
            )}
          </div>

          <div className="px-5 py-6">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-scoreboard-muted">
                  {battingTeam?.name ?? 'Batting'}
                </p>
                <p className="text-6xl font-bold tabular-nums tracking-tight">
                  {inn.runs}
                  <span className="text-scoreboard-muted">/</span>
                  {inn.wickets}
                </p>
              </div>
              <div className="pb-1 text-right text-sm text-scoreboard-muted">
                <p className="tabular-nums">
                  {overs} ov · CRR {rr}
                </p>
                <p className="mt-0.5 truncate">vs {bowlingTeam?.name ?? 'Bowling'}</p>
              </div>
            </div>
            {inn.target !== undefined && isLive && (
              <p className="mt-3 text-sm font-medium text-scoreboard-accent">
                Target {inn.target} · need {runsNeeded} off {ballsLeft}
                {reqRate ? ` · RRR ${reqRate}` : ''}
              </p>
            )}
          </div>

          {/* Recent balls */}
          {state.balls.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto border-t border-scoreboard-border px-5 py-3">
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-scoreboard-muted">
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
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Bowling
            </h2>
            <BowlingCard bowling={state.bowling} playerNames={playerNames} />
          </div>
        </section>

        {isLive && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Updates automatically every few seconds.
          </p>
        )}
      </main>

      <footer className="border-t border-border py-6">
        <div className="container flex max-w-3xl flex-col items-center gap-2 text-center text-xs text-muted-foreground">
          <p>
            Scored with{' '}
            <Link href="/" className="font-medium text-primary hover:underline">
              Open Innings
            </Link>{' '}
            — free, open-source cricket scoring. Forever.
          </p>
        </div>
      </footer>
    </div>
  );
}
