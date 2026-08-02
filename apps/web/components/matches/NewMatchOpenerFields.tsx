'use client';

import { useState } from 'react';
import { Shield, Coins, Users } from 'lucide-react';
import { resolveBattingSides } from '@open-innings/shared';
import { FormSection, Label, Select } from '@/components/ui';

type Team = { id: string; name: string };
type Player = { id: string; fullName: string };

/**
 * The team-dependent slice of the new-match form: which two teams, the toss,
 * and the three opener pickers. Rendered inside the page's <form
 * action={createMatchAction}> — every <select> here still posts as a plain
 * named field, this component only adds live filtering on top.
 */
export function NewMatchOpenerFields({
  teams,
  squadsByTeam,
}: {
  teams: Team[];
  squadsByTeam: Record<string, Player[]>;
}) {
  const [teamAId, setTeamAId] = useState(teams[0]?.id ?? '');
  const [teamBId, setTeamBId] = useState(teams[1]?.id ?? teams[0]?.id ?? '');
  const [tossWinnerTeamId, setTossWinnerTeamId] = useState('');
  const [tossDecision, setTossDecision] = useState<'' | 'bat' | 'bowl'>('');

  const { battingTeamId, bowlingTeamId } = resolveBattingSides(
    teamAId,
    teamBId,
    tossWinnerTeamId || undefined,
    (tossDecision || undefined) as 'bat' | 'bowl' | undefined,
  );
  const battingSquad = squadsByTeam[battingTeamId] ?? [];
  const bowlingSquad = squadsByTeam[bowlingTeamId] ?? [];
  const battingTeamName = teams.find((t) => t.id === battingTeamId)?.name ?? 'Team A';

  const [strikerId, setStrikerId] = useState('');
  const [nonStrikerId, setNonStrikerId] = useState('');
  const [bowlerId, setBowlerId] = useState('');

  // A previously-picked opener may no longer be on the (new) batting/bowling
  // side once teams or the toss change — clear rather than silently submit a
  // stale, now-invalid id. Adjusted during render (React's recommended
  // pattern for resetting state off a prop/derived-value change) rather than
  // via an effect, which would cause an extra render pass for no benefit.
  const [prevBattingTeamId, setPrevBattingTeamId] = useState(battingTeamId);
  if (battingTeamId !== prevBattingTeamId) {
    setPrevBattingTeamId(battingTeamId);
    setStrikerId('');
    setNonStrikerId('');
  }
  const [prevBowlingTeamId, setPrevBowlingTeamId] = useState(bowlingTeamId);
  if (bowlingTeamId !== prevBowlingTeamId) {
    setPrevBowlingTeamId(bowlingTeamId);
    setBowlerId('');
  }

  return (
    <>
      {/* Teams */}
      <FormSection title="Teams" icon={<Shield className="h-4 w-4" />}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
          <div>
            <Label htmlFor="teamAId">Team A</Label>
            <Select
              id="teamAId"
              name="teamAId"
              required
              value={teamAId}
              onChange={(e) => setTeamAId(e.target.value)}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <span className="text-muted-foreground pb-2.5 text-xs font-bold uppercase">vs</span>
          <div>
            <Label htmlFor="teamBId">Team B</Label>
            <Select
              id="teamBId"
              name="teamBId"
              required
              value={teamBId}
              onChange={(e) => setTeamBId(e.target.value)}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </FormSection>

      {/* Toss */}
      <FormSection title="Toss" icon={<Coins className="h-4 w-4" />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="tossWinnerTeamId">Toss winner</Label>
            <Select
              id="tossWinnerTeamId"
              name="tossWinnerTeamId"
              value={tossWinnerTeamId}
              onChange={(e) => setTossWinnerTeamId(e.target.value)}
            >
              <option value="">—</option>
              {teams
                .filter((t) => t.id === teamAId || t.id === teamBId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="tossDecision">Decision</Label>
            <Select
              id="tossDecision"
              name="tossDecision"
              value={tossDecision}
              onChange={(e) => setTossDecision(e.target.value as '' | 'bat' | 'bowl')}
            >
              <option value="">—</option>
              <option value="bat">Bat</option>
              <option value="bowl">Bowl</option>
            </Select>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          Leave blank to default to {battingTeamName} batting first.
        </p>
      </FormSection>

      {/* Openers */}
      <FormSection title="Opening players" icon={<Users className="h-4 w-4" />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="openingStrikerId">Striker</Label>
            <Select
              id="openingStrikerId"
              name="openingStrikerId"
              required
              value={strikerId}
              onChange={(e) => setStrikerId(e.target.value)}
            >
              <option value="">—</option>
              {battingSquad.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="openingNonStrikerId">Non-striker</Label>
            <Select
              id="openingNonStrikerId"
              name="openingNonStrikerId"
              required
              value={nonStrikerId}
              onChange={(e) => setNonStrikerId(e.target.value)}
            >
              <option value="">—</option>
              {battingSquad
                .filter((p) => p.id !== strikerId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="openingBowlerId">Opening bowler</Label>
          <Select
            id="openingBowlerId"
            name="openingBowlerId"
            required
            value={bowlerId}
            onChange={(e) => setBowlerId(e.target.value)}
          >
            <option value="">—</option>
            {bowlingSquad.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </Select>
        </div>
        {battingSquad.length === 0 && (
          <p className="text-destructive text-xs">
            {battingTeamName} has no players yet — add some to its squad first.
          </p>
        )}
      </FormSection>
    </>
  );
}
