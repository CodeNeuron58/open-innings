import { notFound } from 'next/navigation';
import {
  loadMatchInProgress,
  getTeamMembers,
  getTeam,
} from '@/lib/db/queries';
import {
  replayInnings,
  asInningsId,
  asPlayerId,
} from '@/lib/scoring';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function ScorePage({ params }: Props) {
  const { id } = await params;
  const dbDown = !process.env.DATABASE_URL;

  // With no DB, render an empty state. UI still works visually.
  if (dbDown) {
    return (
      <div className="container flex max-w-md flex-col items-center py-16 text-center">
        <div className="rounded-lg border border-dashed border-border bg-card/50 px-8 py-10">
          <h1 className="mb-2 text-2xl font-bold">Database not configured</h1>
          <p className="text-sm text-muted-foreground">
            Set <code className="rounded bg-muted px-1.5 py-0.5">DATABASE_URL</code> in{' '}
            <code className="rounded bg-muted px-1.5 py-0.5">.env.local</code> and run migrations
            to enable scoring.
          </p>
        </div>
      </div>
    );
  }

  const data = await loadMatchInProgress(id).catch(() => null);
  if (!data) notFound();

  const { match, currentInnings: inning, balls } = data;

  // Normalize DB rows → BallEventInput (branded ids + null→undefined)
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

  // Build state via the engine, then replay every ball.
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

  // Gather players from both squads so the wicket dialog has fielder options.
  const [teamAPlayers, teamBPlayers, teamA, teamB] = await Promise.all([
    getTeamMembers(match.teamAId).catch(() => []),
    getTeamMembers(match.teamBId).catch(() => []),
    getTeam(match.teamAId).catch(() => null),
    getTeam(match.teamBId).catch(() => null),
  ]);
  const players = [...teamAPlayers, ...teamBPlayers].map((p) => ({
    id: p.id,
    fullName: p.fullName,
  }));

  const battingTeamName =
    (inning.battingTeamId === match.teamAId ? teamA?.name : teamB?.name) ?? undefined;
  const bowlingTeamName =
    (inning.bowlingTeamId === match.teamAId ? teamA?.name : teamB?.name) ?? undefined;

  // Lazy import to keep the page a server component (avoid hydration mismatch).
  const { ScorerClient } = await import('@/components/scorer/ScorerClient');
  return (
    <ScorerClient
      matchId={id}
      initialState={state}
      players={players}
      matchTitle={match.title ?? undefined}
      battingTeamName={battingTeamName}
      bowlingTeamName={bowlingTeamName}
    />
  );
}