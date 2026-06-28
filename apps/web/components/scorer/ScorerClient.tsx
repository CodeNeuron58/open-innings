'use client';

import { useState, useTransition } from 'react';
import {
  type BallEventInput,
  type BallEventType,
  type MatchState,
  type PlayerId,
  type WicketType,
  asPlayerId,
} from '@/lib/scoring';
import type { BallEvent } from '@/lib/scoring';

type Player = { id: string; fullName: string };

type Props = {
  matchId: string;
  initialState: MatchState;
  players: Player[];
  /** When true, show DB-not-configured message */
  dbDown?: boolean;
};

export function ScorerClient({ matchId, initialState: state0, players, dbDown }: Props) {
  const [state, setState] = useState<MatchState>(state0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showWicket, setShowWicket] = useState(false);

  // Build player lookup
  const playerMap: Record<string, string> = {};
  for (const p of players) playerMap[p.id] = p.fullName;
  const name = (id: PlayerId | string) => playerMap[id as string] ?? String(id).slice(0, 6);

  // POST a ball event to the API
  async function postBall(input: BallEventInput) {
    if (dbDown) return; // No-op if DB not configured
    setError(null);
    const res = await fetch(`/api/matches/${matchId}/ball`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Failed to record ball');
      return;
    }
    setState(data.state as MatchState);
  }

  async function undo() {
    if (dbDown) return;
    setError(null);
    const res = await fetch(`/api/matches/${matchId}/ball`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Failed to undo');
      return;
    }
    setState(data.state as MatchState);
  }

  function handleRuns(runsOffBat: number) {
    startTransition(() => {
      const input: BallEventInput = {
        inningsId: state.currentInnings.id,
        eventType: String(runsOffBat) as BallEventType,
        runsOffBat,
        extraRuns: 0,
        totalRuns: runsOffBat,
        batsmanId: state.currentInnings.strikerId,
        nonStrikerId: state.currentInnings.nonStrikerId,
        bowlerId: state.currentInnings.currentBowlerId,
      };
      postBall(input);
    });
  }

  function handleExtra(extraType: 'wide' | 'no_ball' | 'bye' | 'leg_bye', runs: number) {
    startTransition(() => {
      const isExtraBall = extraType === 'wide' || extraType === 'no_ball';
      const runsOffBat = isExtraBall ? Math.max(0, runs - 1) : 0;
      const extraRuns = runs - runsOffBat;
      const input: BallEventInput = {
        inningsId: state.currentInnings.id,
        eventType: extraType,
        runsOffBat,
        extraRuns,
        totalRuns: runs,
        batsmanId: state.currentInnings.strikerId,
        nonStrikerId: state.currentInnings.nonStrikerId,
        bowlerId: state.currentInnings.currentBowlerId,
      };
      postBall(input);
    });
  }

  function handleWicketConfirm(wicketType: WicketType, wicketPlayerId: string, fielderId?: string) {
    startTransition(() => {
      const input: BallEventInput = {
        inningsId: state.currentInnings.id,
        eventType: 'wicket',
        runsOffBat: 0,
        extraRuns: 0,
        totalRuns: 0,
        batsmanId: state.currentInnings.strikerId,
        nonStrikerId: state.currentInnings.nonStrikerId,
        bowlerId: state.currentInnings.currentBowlerId,
        wicketType,
        wicketPlayerId: asPlayerId(wicketPlayerId),
        fielderId: fielderId ? asPlayerId(fielderId) : undefined,
      };
      postBall(input);
      setShowWicket(false);
    });
  }

  const inn = state.currentInnings;
  const strikerStats = state.batting[inn.strikerId];
  const nonStrikerStats = state.batting[inn.nonStrikerId];
  const bowlerStats = state.bowling[inn.currentBowlerId];
  const isFreeHitNext = inn.isFreeHitNext;
  const completed = inn.status === 'completed';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Score header */}
      <header className="border-b border-border bg-card p-4">
        <div className="mb-1 flex items-baseline justify-between">
          <h1 className="text-4xl font-bold tabular-nums">
            {inn.runs}/{inn.wickets}
          </h1>
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatOversLocal(inn.ballsBowled)} ov · RR {rr(inn.runs, inn.ballsBowled)}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          Target: {inn.target ?? '—'}
        </div>
        {isFreeHitNext && (
          <div className="mt-2 inline-block rounded bg-yellow-500 px-2 py-0.5 text-xs font-bold text-yellow-950">
            FREE HIT NEXT
          </div>
        )}
      </header>

      {/* Batsmen + bowler */}
      <section className="grid grid-cols-2 gap-2 border-b border-border p-4 text-sm">
        <div>
          <p className="font-medium">
            * {name(inn.strikerId)}{' '}
            <span className="text-muted-foreground">
              {strikerStats?.runs ?? 0}({strikerStats?.balls ?? 0})
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            4s: {strikerStats?.fours ?? 0} · 6s: {strikerStats?.sixes ?? 0}
          </p>
        </div>
        <div>
          <p className="font-medium">
            {name(inn.nonStrikerId)}{' '}
            <span className="text-muted-foreground">
              {nonStrikerStats?.runs ?? 0}({nonStrikerStats?.balls ?? 0})
            </span>
          </p>
        </div>
        <div className="col-span-2 mt-1 border-t border-border pt-2 text-xs">
          <span className="text-muted-foreground">Bowler: </span>
          <span className="font-medium">{name(inn.currentBowlerId)}</span>
          <span className="text-muted-foreground">
            {' '}
            — {bowlerStats?.runs ?? 0}/{bowlerStats?.wickets ?? 0} in {formatOversLocal(bowlerStats?.balls ?? 0)}
          </span>
        </div>
      </section>

      {error && (
        <div className="bg-red-100 px-4 py-2 text-sm text-red-900">{error}</div>
      )}

      {dbDown && (
        <div className="bg-yellow-100 px-4 py-2 text-sm text-yellow-900">
          DB not configured — buttons are visual only. Set <code>DATABASE_URL</code> to enable scoring.
        </div>
      )}

      {completed && (
        <div className="bg-green-100 px-4 py-3 text-center font-bold text-green-900">
          INNINGS COMPLETE
        </div>
      )}

      {/* Score buttons */}
      <main className="flex-1 p-3">
        <div className="grid grid-cols-4 gap-2">
          <BigButton onClick={() => handleRuns(0)} disabled={pending || completed}>
            0
          </BigButton>
          <BigButton onClick={() => handleRuns(1)} disabled={pending || completed} variant="run">
            1
          </BigButton>
          <BigButton onClick={() => handleRuns(2)} disabled={pending || completed} variant="run">
            2
          </BigButton>
          <BigButton onClick={() => handleRuns(3)} disabled={pending || completed} variant="run">
            3
          </BigButton>
          <BigButton onClick={() => handleRuns(4)} disabled={pending || completed} variant="boundary">
            4
          </BigButton>
          <BigButton onClick={() => handleRuns(6)} disabled={pending || completed} variant="six">
            6
          </BigButton>
          <BigButton onClick={() => handleExtra('wide', 1)} disabled={pending || completed} variant="extra">
            WD
          </BigButton>
          <BigButton onClick={() => handleExtra('no_ball', 1)} disabled={pending || completed} variant="extra">
            NB
          </BigButton>
          <BigButton onClick={() => handleExtra('bye', 1)} disabled={pending || completed} variant="extra">
            B
          </BigButton>
          <BigButton onClick={() => handleExtra('leg_bye', 1)} disabled={pending || completed} variant="extra">
            LB
          </BigButton>
          <BigButton onClick={() => setShowWicket(true)} disabled={pending || completed} variant="wicket">
            W
          </BigButton>
          <BigButton onClick={undo} disabled={pending || state.balls.length === 0} variant="undo">
            ↶
          </BigButton>
        </div>
      </main>

      {/* Recent balls */}
      <footer className="border-t border-border bg-card p-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Recent</p>
        <div className="flex flex-wrap gap-1">
          {state.balls
            .slice(-12)
            .reverse()
            .map((b, i) => (
              <BallChip key={state.balls.length - i} ball={b} />
            ))}
        </div>
      </footer>

      {showWicket && (
        <WicketDialog
          strikerId={inn.strikerId}
          nonStrikerId={inn.nonStrikerId}
          players={players}
          onConfirm={handleWicketConfirm}
          onCancel={() => setShowWicket(false)}
        />
      )}
    </div>
  );
}

function BigButton({
  children,
  onClick,
  disabled,
  variant = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'run' | 'boundary' | 'six' | 'extra' | 'wicket' | 'undo';
}) {
  const base = 'flex h-16 items-center justify-center rounded-lg text-2xl font-bold transition-colors';
  const styles = {
    default: 'bg-muted hover:bg-muted/70',
    run: 'bg-blue-100 text-blue-900 hover:bg-blue-200',
    boundary: 'bg-green-500 text-white hover:bg-green-600',
    six: 'bg-purple-500 text-white hover:bg-purple-600',
    extra: 'bg-orange-100 text-orange-900 hover:bg-orange-200',
    wicket: 'bg-red-600 text-white hover:bg-red-700',
    undo: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
  } as const;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles[variant]} ${disabled ? 'opacity-50' : ''}`}
    >
      {children}
    </button>
  );
}

function BallChip({ ball }: { ball: BallEvent }) {
  let label = '';
  let color = 'bg-muted text-foreground';
  if (ball.wicketType) {
    label = 'W';
    color = 'bg-red-600 text-white';
  } else if (ball.eventType === 'wide') {
    label = 'wd';
    color = 'bg-orange-200 text-orange-900';
  } else if (ball.eventType === 'no_ball') {
    label = 'nb';
    color = 'bg-orange-200 text-orange-900';
  } else if (ball.eventType === 'bye') {
    label = `${ball.totalRuns}b`;
    color = 'bg-yellow-200 text-yellow-900';
  } else if (ball.eventType === 'leg_bye') {
    label = `${ball.totalRuns}lb`;
    color = 'bg-yellow-200 text-yellow-900';
  } else if (ball.runsOffBat === 4) {
    label = '4';
    color = 'bg-green-500 text-white';
  } else if (ball.runsOffBat === 6) {
    label = '6';
    color = 'bg-purple-500 text-white';
  } else if (ball.runsOffBat === 0) {
    label = '·';
    color = 'bg-muted text-muted-foreground';
  } else {
    label = String(ball.runsOffBat);
  }

  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${color}`}
      title={`Over ${ball.overNumber}.${ball.ballNumber}`}
    >
      {label}
    </span>
  );
}

function WicketDialog({
  strikerId,
  nonStrikerId,
  players,
  onConfirm,
  onCancel,
}: {
  strikerId: PlayerId;
  nonStrikerId: PlayerId;
  players: Player[];
  onConfirm: (type: WicketType, playerId: string, fielderId?: string) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<WicketType>('bowled');
  const [outBatsman, setOutBatsman] = useState<string>(strikerId as string);
  const [fielderId, setFielderId] = useState<string>('');

  const needsFielder = type === 'caught' || type === 'caught_behind' || type === 'stumped' || type === 'run_out';

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 sm:items-center sm:justify-center">
      <div className="w-full rounded-t-2xl bg-card p-5 sm:max-w-md sm:rounded-2xl">
        <h2 className="mb-4 text-lg font-bold">Wicket</h2>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as WicketType)}
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            >
              <option value="bowled">Bowled</option>
              <option value="caught">Caught</option>
              <option value="caught_behind">Caught behind</option>
              <option value="lbw">LBW</option>
              <option value="run_out">Run out</option>
              <option value="stumped">Stumped</option>
              <option value="hit_wicket">Hit wicket</option>
              <option value="retired_hurt">Retired hurt</option>
              <option value="retired_out">Retired out</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Batsman out</label>
            <select
              value={outBatsman}
              onChange={(e) => setOutBatsman(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            >
              <option value={strikerId}>Striker</option>
              <option value={nonStrikerId}>Non-striker</option>
            </select>
          </div>

          {needsFielder && (
            <div>
              <label className="mb-1 block text-sm font-medium">Fielder</label>
              <select
                value={fielderId}
                onChange={(e) => setFielderId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              >
                <option value="">—</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={() => onConfirm(type, outBatsman, needsFielder && fielderId ? fielderId : undefined)}
            className="flex-1 rounded-md bg-red-600 px-4 py-3 font-bold text-white hover:bg-red-700"
          >
            Confirm wicket
          </button>
          <button
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-3 text-sm hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Local formatters (avoid importing server-side helpers into client)
function formatOversLocal(legalBalls: number): string {
  const overs = Math.floor(legalBalls / 6);
  const balls = legalBalls % 6;
  return `${overs}.${balls}`;
}

function rr(runs: number, legalBalls: number): string {
  if (legalBalls === 0) return '0.00';
  return ((runs / legalBalls) * 6).toFixed(2);
}