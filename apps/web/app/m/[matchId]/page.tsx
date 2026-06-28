import Link from 'next/link';
import { notFound } from 'next/navigation';
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

  return (
    <main className="container max-w-3xl py-6">
      {/* Header */}
      <header className="mb-6">
        {match.title && <h1 className="text-xl font-bold">{match.title}</h1>}
        {match.venue && <p className="text-sm text-muted-foreground">{match.venue}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          {teamA?.name ?? 'Team A'} vs {teamB?.name ?? 'Team B'} · {match.oversPerInnings} overs
        </p>
      </header>

      {/* Score block */}
      <section className="mb-6 rounded-lg border border-border bg-card p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{battingTeam?.name ?? 'Batting'}</p>
            <p className="text-5xl font-bold tabular-nums">
              {inn.runs}/{inn.wickets}
            </p>
            <p className="text-sm text-muted-foreground">
              ({overs} ov · RR {rr})
            </p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>vs {bowlingTeam?.name ?? 'Bowling'}</p>
            {inn.target !== undefined && (
              <p className="text-xs">Target: {inn.target}</p>
            )}
          </div>
        </div>
      </section>

      {/* Batting + bowling side by side on desktop */}
      <section className="grid gap-6 md:grid-cols-2">
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

      {/* Recent balls */}
      {state.balls.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recent
          </h2>
          <div className="flex flex-wrap gap-1">
            {state.balls.slice(-18).map((b, i) => (
              <span
                key={i}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold"
                title={`Over ${b.overNumber}.${b.ballNumber}`}
              >
                {b.wicketType
                  ? 'W'
                  : b.eventType === 'wide'
                    ? 'wd'
                    : b.eventType === 'no_ball'
                      ? 'nb'
                      : b.eventType === 'bye'
                        ? `${b.totalRuns}b`
                        : b.eventType === 'leg_bye'
                          ? `${b.totalRuns}lb`
                          : b.runsOffBat === 0
                            ? '·'
                            : String(b.runsOffBat)}
              </span>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        <Link href="/" className="hover:underline">Open Innings</Link> · free, forever
      </footer>
    </main>
  );
}