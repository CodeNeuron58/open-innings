import { notFound, redirect } from 'next/navigation';
import { Trophy } from 'lucide-react';
import {
  loadMatchInProgress,
  getTeamMembers,
  getTeam,
  getInnings,
} from '@/lib/db/queries';
import { getUserId } from '@/lib/auth/local';
import {
  replayInnings,
  asInningsId,
  asPlayerId,
} from '@/lib/scoring';
import { computeMatchResult, formatMatchResult } from '@/lib/match-result';
import { startSecondInningsAction, endInningsAction } from './actions';
import { UndoLastBallButton } from '@/components/scorer/UndoLastBallButton';
import { Button, ButtonLink, Card, Label, PageHeader, Select } from '@/components/ui';
import { formatOvers } from '@/lib/utils';
import type { Innings, Team } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function ScorePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { error } = await searchParams;
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

  const userId = await getUserId();
  if (!userId) redirect('/login');

  const data = await loadMatchInProgress(id).catch(() => null);
  if (!data) notFound();

  const { match, currentInnings: inning, balls } = data;
  if (match.createdBy !== userId) notFound();

  const [teamA, teamB, allInnings] = await Promise.all([
    getTeam(match.teamAId).catch(() => null),
    getTeam(match.teamBId).catch(() => null),
    getInnings(id).catch(() => [] as Innings[]),
  ]);
  const teamName = (teamId: string) =>
    (teamId === match.teamAId ? teamA?.name : teamB?.name) ?? 'Team';

  // ── Match finished → result screen ────────────────────────────────────────
  const chase = allInnings.find((i) => i.inningsNumber >= 2);
  const matchDone =
    match.status === 'completed' ||
    (inning.inningsNumber >= 2 && inning.status === 'completed');
  if (matchDone) {
    return (
      <MatchDone
        matchId={id}
        title={match.title ?? `${teamName(match.teamAId)} vs ${teamName(match.teamBId)}`}
        summary={match.summary ?? computeSummaryFallback(chase, teamA, teamB)}
        innings={allInnings}
        teamName={teamName}
      />
    );
  }

  // ── Innings break → set up the chase ──────────────────────────────────────
  if (inning.inningsNumber === 1 && inning.status === 'completed') {
    const [nextBattingSquad, nextBowlingSquad] = await Promise.all([
      getTeamMembers(inning.bowlingTeamId).catch(() => []),
      getTeamMembers(inning.battingTeamId).catch(() => []),
    ]);
    return (
      <div className="container max-w-xl py-8">
        <PageHeader
          title="Innings break"
          description={`${teamName(inning.battingTeamId)} made ${inning.runs}/${inning.wickets} in ${formatOvers(inning.ballsBowled)} overs.`}
        />

        <Card className="mb-5 border-primary/30 bg-accent/40 p-4 text-sm">
          <strong>{teamName(inning.bowlingTeamId)}</strong> need{' '}
          <strong className="tabular-nums">{inning.runs + 1}</strong> to win from{' '}
          {match.oversPerInnings} overs.
        </Card>

        {error && (
          <div
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        <form action={startSecondInningsAction.bind(null, id)}>
          <Card className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="openingStrikerId">Opening striker</Label>
                <Select id="openingStrikerId" name="openingStrikerId" required>
                  <option value="">—</option>
                  {nextBattingSquad.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="openingNonStrikerId">Opening non-striker</Label>
                <Select id="openingNonStrikerId" name="openingNonStrikerId" required>
                  <option value="">—</option>
                  {nextBattingSquad.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="openingBowlerId">Opening bowler</Label>
              <Select id="openingBowlerId" name="openingBowlerId" required>
                <option value="">—</option>
                {nextBowlingSquad.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </Select>
            </div>
          </Card>

          <div className="mt-5 flex flex-col gap-4">
            <Button type="submit" size="lg" className="w-full">
              Start 2nd innings
            </Button>
            <UndoLastBallButton matchId={id} />
          </div>
        </form>
      </div>
    );
  }

  // ── Live scoring ──────────────────────────────────────────────────────────

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
  const [teamAPlayers, teamBPlayers] = await Promise.all([
    getTeamMembers(match.teamAId).catch(() => []),
    getTeamMembers(match.teamBId).catch(() => []),
  ]);
  const players = [...teamAPlayers, ...teamBPlayers].map((p) => ({
    id: p.id,
    fullName: p.fullName,
  }));
  const toLite = (list: typeof teamAPlayers) =>
    list.map((p) => ({ id: p.id, fullName: p.fullName }));
  const battingSquad =
    inning.battingTeamId === match.teamAId ? toLite(teamAPlayers) : toLite(teamBPlayers);
  const bowlingSquad =
    inning.bowlingTeamId === match.teamAId ? toLite(teamAPlayers) : toLite(teamBPlayers);

  const battingTeamName = teamName(inning.battingTeamId);
  const bowlingTeamName = teamName(inning.bowlingTeamId);

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
      battingSquad={battingSquad}
      bowlingSquad={bowlingSquad}
      onEndInnings={endInningsAction.bind(null, id)}
    />
  );
}

function computeSummaryFallback(
  chase: Innings | undefined,
  teamA: Team | null,
  teamB: Team | null,
): string {
  if (!chase || chase.target == null) return 'Match complete';
  const result = computeMatchResult({
    runs: chase.runs,
    wickets: chase.wickets,
    target: chase.target,
    maxWickets: chase.maxWickets,
    battingTeamId: chase.battingTeamId,
    bowlingTeamId: chase.bowlingTeamId,
  });
  const winnerName =
    result.winningTeamId === teamA?.id
      ? teamA?.name
      : result.winningTeamId === teamB?.id
        ? teamB?.name
        : null;
  return formatMatchResult(result, winnerName);
}

function MatchDone({
  matchId,
  title,
  summary,
  innings,
  teamName,
}: {
  matchId: string;
  title: string;
  summary: string;
  innings: Innings[];
  teamName: (teamId: string) => string;
}) {
  return (
    <div className="container max-w-xl py-10">
      <div className="mb-6 text-center">
        <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Trophy className="h-7 w-7" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-lg font-semibold text-primary">{summary}</p>
      </div>

      <Card className="divide-y divide-border">
        {innings.map((i) => (
          <div key={i.id} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="font-semibold">{teamName(i.battingTeamId)}</p>
              <p className="text-xs text-muted-foreground">
                {i.inningsNumber === 1 ? '1st innings' : '2nd innings'}
                {i.target != null ? ` · target ${i.target}` : ''}
              </p>
            </div>
            <p className="text-xl font-bold tabular-nums">
              {i.runs}/{i.wickets}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({formatOvers(i.ballsBowled)})
              </span>
            </p>
          </div>
        ))}
      </Card>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <ButtonLink href={`/m/${matchId}`}>View public scorecard</ButtonLink>
        <ButtonLink href="/matches" variant="outline">
          Back to matches
        </ButtonLink>
      </div>
    </div>
  );
}
