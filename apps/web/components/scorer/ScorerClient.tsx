'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ChevronLeft, Share2, Undo2, X } from 'lucide-react';
import {
  type BallEventInput,
  type BallEventType,
  type MatchState,
  type PlayerId,
  type WicketType,
  asPlayerId,
} from '@/lib/scoring';
import { BallChip } from '@/components/BallChip';
import { LiveBadge } from '@/components/ui';
import { cn } from '@/lib/utils';

type Player = { id: string; fullName: string };

type Props = {
  matchId: string;
  initialState: MatchState;
  players: Player[];
  /** When true, show DB-not-configured message */
  dbDown?: boolean;
  matchTitle?: string;
  battingTeamName?: string;
  bowlingTeamName?: string;
  /** Current batting side's squad — candidates for a replacement batter. */
  battingSquad?: Player[];
  /** Current bowling side's squad — candidates for the next over's bowler. */
  bowlingSquad?: Player[];
  /** Server action: end the innings early (no batters left to replace one). */
  onEndInnings?: () => Promise<void>;
};

export function ScorerClient({
  matchId,
  initialState: state0,
  players,
  dbDown,
  matchTitle,
  battingTeamName,
  bowlingTeamName,
  battingSquad,
  bowlingSquad,
  onEndInnings,
}: Props) {
  const [state, setState] = useState<MatchState>(state0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showWicket, setShowWicket] = useState(false);
  // Replacement chosen in the "next batter" / "next bowler" sheets. Sent with
  // the next ball event (that's how the engine learns about the change) and
  // cleared once the server state reflects it.
  const [pendingBatterId, setPendingBatterId] = useState<string | null>(null);
  const [pendingBowlerId, setPendingBowlerId] = useState<string | null>(null);

  // Build player lookup
  const playerMap: Record<string, string> = {};
  for (const p of players) playerMap[p.id] = p.fullName;
  const name = (id: PlayerId | string) => playerMap[id as string] ?? String(id).slice(0, 6);

  // ── Effective on-field players ─────────────────────────────────────────────
  // After a wicket the engine keeps the dismissed batter in state until the
  // next ball names the replacement; after a completed over the engine expects
  // a different bowlerId on the next ball (Law 16.2). The sheets below collect
  // those choices; every ball event is built from these effective ids.
  const innNow = state.currentInnings;
  const lastBall = state.balls[state.balls.length - 1];
  const pendingWicketId =
    lastBall?.wicketType &&
    lastBall.wicketPlayerId &&
    (lastBall.wicketPlayerId === innNow.strikerId ||
      lastBall.wicketPlayerId === innNow.nonStrikerId)
      ? lastBall.wicketPlayerId
      : null;
  const needsBowlerChange =
    innNow.ballsBowled > 0 &&
    innNow.ballsBowled % 6 === 0 &&
    innNow.lastBowlerId === innNow.currentBowlerId;
  const effStriker =
    pendingWicketId === innNow.strikerId && pendingBatterId
      ? asPlayerId(pendingBatterId)
      : innNow.strikerId;
  const effNonStriker =
    pendingWicketId === innNow.nonStrikerId && pendingBatterId
      ? asPlayerId(pendingBatterId)
      : innNow.nonStrikerId;
  const effBowler =
    needsBowlerChange && pendingBowlerId ? asPlayerId(pendingBowlerId) : innNow.currentBowlerId;

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
    setPendingBatterId(null);
    setPendingBowlerId(null);
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
    setPendingBatterId(null);
    setPendingBowlerId(null);
  }

  function handleRuns(runsOffBat: number) {
    startTransition(() => {
      const input: BallEventInput = {
        inningsId: state.currentInnings.id,
        // A dot ball is 'dot' in the event enum — never '0'.
        eventType: runsOffBat === 0 ? 'dot' : (String(runsOffBat) as BallEventType),
        runsOffBat,
        extraRuns: 0,
        totalRuns: runsOffBat,
        batsmanId: effStriker,
        nonStrikerId: effNonStriker,
        bowlerId: effBowler,
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
        batsmanId: effStriker,
        nonStrikerId: effNonStriker,
        bowlerId: effBowler,
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
        batsmanId: effStriker,
        nonStrikerId: effNonStriker,
        bowlerId: effBowler,
        wicketType,
        wicketPlayerId: asPlayerId(wicketPlayerId),
        fielderId: fielderId ? asPlayerId(fielderId) : undefined,
      };
      postBall(input);
      setShowWicket(false);
    });
  }

  const inn = state.currentInnings;
  const strikerStats = state.batting[effStriker];
  const nonStrikerStats = state.batting[effNonStriker];
  const bowlerStats = state.bowling[effBowler];
  const isFreeHitNext = inn.isFreeHitNext;
  const completed = inn.status === 'completed';

  // Mandatory sheets — scoring is blocked until the choice is made.
  const showBatterSheet = !completed && !dbDown && pendingWicketId !== null && !pendingBatterId;
  const showBowlerSheet =
    !completed && !dbDown && !showBatterSheet && needsBowlerChange && !pendingBowlerId;

  const batterCandidates = (battingSquad ?? players).filter(
    (p) =>
      p.id !== (effStriker as string) &&
      p.id !== (effNonStriker as string) &&
      p.id !== (pendingWicketId as string | null) &&
      !state.batting[p.id]?.isOut,
  );
  const bowlerCandidates = (bowlingSquad ?? players).filter(
    (p) => p.id !== (inn.lastBowlerId as string | undefined),
  );

  const totalBalls = state.match.oversPerInnings * 6;
  const ballsLeft = Math.max(0, totalBalls - inn.ballsBowled);
  const runsNeeded = inn.target !== undefined ? Math.max(0, inn.target - inn.runs) : undefined;
  const reqRate =
    runsNeeded !== undefined && ballsLeft > 0 ? ((runsNeeded / ballsLeft) * 6).toFixed(2) : null;

  // "This over" strip — falls back to the last over right after an over ends.
  const curOver = Math.floor(inn.ballsBowled / 6);
  let overBalls = state.balls.filter((b) => b.overNumber === curOver);
  let overLabel = 'This over';
  if (overBalls.length === 0 && state.balls.length > 0) {
    overBalls = state.balls.filter((b) => b.overNumber === curOver - 1);
    overLabel = 'Last over';
  }

  return (
    <div className="flex min-h-screen flex-col bg-scoreboard text-scoreboard-text">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 border-b border-scoreboard-border px-3 py-2.5">
        <Link
          href="/matches"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-scoreboard-muted transition-colors hover:bg-scoreboard-panel hover:text-scoreboard-text"
          aria-label="Back to matches"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold">
            {matchTitle ??
              (battingTeamName && bowlingTeamName
                ? `${battingTeamName} vs ${bowlingTeamName}`
                : 'Scorer')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!completed && <LiveBadge />}
          <Link
            href={`/m/${matchId}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-scoreboard-muted transition-colors hover:bg-scoreboard-panel hover:text-scoreboard-text"
            aria-label="Public scorecard"
            title="Open public scorecard"
          >
            <Share2 className="h-[18px] w-[18px]" />
          </Link>
        </div>
      </div>

      {/* Score hero */}
      <header className="px-4 pb-3 pt-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {battingTeamName && (
              <p className="truncate text-sm font-medium text-scoreboard-muted">
                {battingTeamName}
              </p>
            )}
            <p
              key={`${inn.runs}-${inn.wickets}`}
              className="animate-score-pop text-6xl font-bold tabular-nums tracking-tight"
            >
              {inn.runs}
              <span className="text-scoreboard-muted">/</span>
              {inn.wickets}
            </p>
          </div>
          <div className="pb-1 text-right text-sm text-scoreboard-muted">
            <p className="tabular-nums">
              {formatOversLocal(inn.ballsBowled)}
              <span className="text-scoreboard-muted/70"> / {state.match.oversPerInnings} ov</span>
            </p>
            <p className="tabular-nums">CRR {rr(inn.runs, inn.ballsBowled)}</p>
          </div>
        </div>

        {inn.target !== undefined && !completed && (
          <p className="mt-2 text-sm font-medium text-scoreboard-accent">
            Target {inn.target} · need {runsNeeded} off {ballsLeft}
            {reqRate ? ` · RRR ${reqRate}` : ''}
          </p>
        )}

        {isFreeHitNext && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-extra px-3 py-1 text-xs font-bold uppercase tracking-wide text-extra-foreground">
            <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-current" aria-hidden />
            Free hit next
          </div>
        )}
      </header>

      {/* Batters + bowler */}
      <section className="mx-3 rounded-lg border border-scoreboard-border bg-scoreboard-panel">
        <BatterRow
          label={name(effStriker)}
          stats={strikerStats}
          striker
        />
        <BatterRow label={name(effNonStriker)} stats={nonStrikerStats} />
        <div className="flex items-center justify-between border-t border-scoreboard-border px-4 py-2.5 text-sm">
          <span className="min-w-0 truncate">
            <span className="text-scoreboard-muted">Bowling · </span>
            <span className="font-medium">{name(effBowler)}</span>
          </span>
          <span className="shrink-0 tabular-nums text-scoreboard-muted">
            {bowlerStats?.wickets ?? 0}/{bowlerStats?.runs ?? 0}{' '}
            <span className="text-scoreboard-muted/70">
              ({formatOversLocal(bowlerStats?.balls ?? 0)})
            </span>
          </span>
        </div>
      </section>

      {/* Notices */}
      {error && (
        <div className="mx-3 mt-2 rounded-md bg-wicket/15 px-3 py-2 text-sm text-wicket" role="alert">
          {error}
        </div>
      )}
      {dbDown && (
        <div className="mx-3 mt-2 rounded-md bg-extra/15 px-3 py-2 text-sm text-extra">
          DB not configured — buttons are visual only. Set <code>DATABASE_URL</code> to enable
          scoring.
        </div>
      )}
      {completed && (
        <div className="mx-3 mt-2 rounded-lg border border-scoreboard-border bg-scoreboard-panel p-4 text-center">
          <p className="text-lg font-bold">Innings complete</p>
          <p className="mt-0.5 text-sm text-scoreboard-muted">
            {inn.runs}/{inn.wickets} in {formatOversLocal(inn.ballsBowled)} overs
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {/* Plain anchor: forces a server render so the page can move on
                to the innings break / match result screen. */}
            <a
              href={`/matches/${matchId}/score`}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Continue →
            </a>
            <Link
              href={`/m/${matchId}`}
              className="inline-flex h-10 items-center justify-center rounded-md border border-scoreboard-border px-5 text-sm font-medium text-scoreboard-muted transition-colors hover:text-scoreboard-text"
            >
              Public scorecard
            </Link>
          </div>
        </div>
      )}

      {/* Keypad */}
      <main className="flex-1 px-3 py-3">
        <div className="grid h-full max-h-96 grid-cols-4 grid-rows-3 gap-2">
          <Key onClick={() => handleRuns(0)} disabled={pending || completed} variant="dot">
            0
          </Key>
          <Key onClick={() => handleRuns(1)} disabled={pending || completed}>
            1
          </Key>
          <Key onClick={() => handleRuns(2)} disabled={pending || completed}>
            2
          </Key>
          <Key onClick={() => handleRuns(3)} disabled={pending || completed}>
            3
          </Key>
          <Key onClick={() => handleRuns(4)} disabled={pending || completed} variant="four">
            4
          </Key>
          <Key onClick={() => handleRuns(6)} disabled={pending || completed} variant="six">
            6
          </Key>
          <Key onClick={() => handleExtra('wide', 1)} disabled={pending || completed} variant="extra">
            WD
          </Key>
          <Key
            onClick={() => handleExtra('no_ball', 1)}
            disabled={pending || completed}
            variant="extra"
          >
            NB
          </Key>
          <Key onClick={() => handleExtra('bye', 1)} disabled={pending || completed} variant="extra">
            B
          </Key>
          <Key
            onClick={() => handleExtra('leg_bye', 1)}
            disabled={pending || completed}
            variant="extra"
          >
            LB
          </Key>
          <Key onClick={() => setShowWicket(true)} disabled={pending || completed} variant="wicket">
            W
          </Key>
          <Key onClick={undo} disabled={pending || state.balls.length === 0} variant="undo">
            <Undo2 className="h-6 w-6" />
            <span className="sr-only">Undo last ball</span>
          </Key>
        </div>
      </main>

      {/* Over strips */}
      <footer className="safe-bottom border-t border-scoreboard-border bg-scoreboard-panel/60 px-4 py-3">
        <div className="mb-2 flex items-center gap-2 overflow-x-auto">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-scoreboard-muted">
            {overLabel}
          </span>
          {overBalls.length === 0 ? (
            <span className="text-xs text-scoreboard-muted/70">New over — no balls yet</span>
          ) : (
            overBalls.map((b, i) => <BallChip key={`${b.overNumber}-${i}`} ball={b} size="sm" />)
          )}
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-scoreboard-muted/70">
            Recent
          </span>
          {state.balls
            .slice(-12)
            .reverse()
            .map((b, i) => (
              <BallChip
                key={state.balls.length - i}
                ball={b}
                size="sm"
                className="opacity-80"
              />
            ))}
        </div>
      </footer>

      {showWicket && (
        <WicketSheet
          strikerId={effStriker}
          strikerName={name(effStriker)}
          nonStrikerId={effNonStriker}
          nonStrikerName={name(effNonStriker)}
          players={players}
          onConfirm={handleWicketConfirm}
          onCancel={() => setShowWicket(false)}
        />
      )}

      {showBatterSheet && (
        <NextPlayerSheet
          title="Next batter"
          subtitle={`${name(pendingWicketId!)} ${lastBall?.wicketType === 'retired_hurt' ? 'retired hurt' : 'is out'} — who comes in?`}
          candidates={batterCandidates.map((p) => ({
            id: p.id,
            label: p.fullName,
            tag: state.batting[p.id]?.isRetiredHurt ? 'retired hurt' : undefined,
          }))}
          emptyMessage="No batters left in the squad."
          onSelect={setPendingBatterId}
          onUndo={undo}
          onEndInnings={onEndInnings}
        />
      )}

      {showBowlerSheet && (
        <NextPlayerSheet
          title="New bowler"
          subtitle={`Over complete — ${name(inn.currentBowlerId)} can't bowl two in a row (Law 16.2).`}
          candidates={bowlerCandidates.map((p) => ({ id: p.id, label: p.fullName }))}
          emptyMessage="No other bowler in the squad — add players to the team."
          onSelect={setPendingBowlerId}
          onUndo={undo}
        />
      )}
    </div>
  );
}

function BatterRow({
  label,
  stats,
  striker = false,
}: {
  label: string;
  stats?: { runs: number; balls: number; fours: number; sixes: number };
  striker?: boolean;
}) {
  const sr =
    stats && stats.balls > 0 ? ((stats.runs / stats.balls) * 100).toFixed(0) : '—';
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            striker ? 'bg-primary' : 'bg-scoreboard-border',
          )}
          aria-hidden
        />
        <span className={cn('truncate', striker ? 'font-semibold' : 'text-scoreboard-muted')}>
          {label}
          {striker && <span className="sr-only"> (on strike)</span>}
        </span>
      </span>
      <span className="shrink-0 tabular-nums">
        <span className={striker ? 'font-semibold' : 'text-scoreboard-muted'}>
          {stats?.runs ?? 0}
          <span className="text-scoreboard-muted">({stats?.balls ?? 0})</span>
        </span>
        <span className="ml-2 text-xs text-scoreboard-muted">
          {stats ? `${stats.fours}×4 ${stats.sixes}×6 · SR ${sr}` : ''}
        </span>
      </span>
    </div>
  );
}

type KeyVariant = 'run' | 'dot' | 'four' | 'six' | 'extra' | 'wicket' | 'undo';

function Key({
  children,
  onClick,
  disabled,
  variant = 'run',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: KeyVariant;
}) {
  const styles: Record<KeyVariant, string> = {
    run: 'bg-scoreboard-panel border border-scoreboard-border text-scoreboard-text hover:border-scoreboard-muted/50',
    dot: 'bg-scoreboard-panel border border-scoreboard-border text-scoreboard-muted hover:border-scoreboard-muted/50',
    four: 'bg-four text-four-foreground shadow-lg shadow-four/25 hover:brightness-110',
    six: 'bg-six text-six-foreground shadow-lg shadow-six/25 hover:brightness-110',
    extra:
      'bg-scoreboard-panel border border-extra/40 text-extra hover:border-extra/70 text-xl',
    wicket: 'bg-wicket text-wicket-foreground shadow-lg shadow-wicket/25 hover:brightness-110',
    undo: 'bg-transparent border border-scoreboard-border text-scoreboard-muted hover:text-scoreboard-text hover:border-scoreboard-muted/50',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-h-14 items-center justify-center rounded-xl text-2xl font-bold transition-all',
        'active:scale-95 disabled:pointer-events-none disabled:opacity-40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        styles[variant],
      )}
    >
      {children}
    </button>
  );
}

const wicketTypes: { value: WicketType; label: string }[] = [
  { value: 'bowled', label: 'Bowled' },
  { value: 'caught', label: 'Caught' },
  { value: 'caught_behind', label: 'Caught behind' },
  { value: 'lbw', label: 'LBW' },
  { value: 'run_out', label: 'Run out' },
  { value: 'stumped', label: 'Stumped' },
  { value: 'hit_wicket', label: 'Hit wicket' },
  { value: 'retired_hurt', label: 'Retired hurt' },
  { value: 'retired_out', label: 'Retired out' },
];

function WicketSheet({
  strikerId,
  strikerName,
  nonStrikerId,
  nonStrikerName,
  players,
  onConfirm,
  onCancel,
}: {
  strikerId: PlayerId;
  strikerName: string;
  nonStrikerId: PlayerId;
  nonStrikerName: string;
  players: Player[];
  onConfirm: (type: WicketType, playerId: string, fielderId?: string) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<WicketType>('bowled');
  const [outBatsman, setOutBatsman] = useState<string>(strikerId as string);
  const [fielderId, setFielderId] = useState<string>('');

  const needsFielder =
    type === 'caught' || type === 'caught_behind' || type === 'stumped' || type === 'run_out';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Record wicket"
    >
      <div className="safe-bottom w-full animate-slide-up rounded-t-2xl border-t border-scoreboard-border bg-scoreboard-panel p-5 text-scoreboard-text sm:max-w-md sm:rounded-2xl sm:border">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">
            <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-wicket text-sm font-bold text-wicket-foreground">
              W
            </span>
            Wicket
          </h2>
          <button
            onClick={onCancel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-scoreboard-muted hover:bg-scoreboard hover:text-scoreboard-text"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-scoreboard-muted">
          How out
        </p>
        <div className="mb-4 grid grid-cols-3 gap-1.5">
          {wicketTypes.map((w) => (
            <button
              key={w.value}
              onClick={() => setType(w.value)}
              className={cn(
                'rounded-md px-2 py-2.5 text-xs font-medium transition-colors',
                type === w.value
                  ? 'bg-wicket text-wicket-foreground'
                  : 'bg-scoreboard text-scoreboard-muted hover:text-scoreboard-text',
              )}
            >
              {w.label}
            </button>
          ))}
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-scoreboard-muted">
          Batter out
        </p>
        <div className="mb-4 grid grid-cols-2 gap-1.5">
          <button
            onClick={() => setOutBatsman(strikerId as string)}
            className={cn(
              'truncate rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
              outBatsman === (strikerId as string)
                ? 'bg-primary text-primary-foreground'
                : 'bg-scoreboard text-scoreboard-muted hover:text-scoreboard-text',
            )}
          >
            {strikerName} *
          </button>
          <button
            onClick={() => setOutBatsman(nonStrikerId as string)}
            className={cn(
              'truncate rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
              outBatsman === (nonStrikerId as string)
                ? 'bg-primary text-primary-foreground'
                : 'bg-scoreboard text-scoreboard-muted hover:text-scoreboard-text',
            )}
          >
            {nonStrikerName}
          </button>
        </div>

        {needsFielder && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-scoreboard-muted">
              Fielder
            </p>
            <select
              value={fielderId}
              onChange={(e) => setFielderId(e.target.value)}
              className="h-11 w-full rounded-md border border-scoreboard-border bg-scoreboard px-3 text-sm text-scoreboard-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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

        <div className="flex gap-2">
          <button
            onClick={() =>
              onConfirm(type, outBatsman, needsFielder && fielderId ? fielderId : undefined)
            }
            className="flex-1 rounded-md bg-wicket px-4 py-3.5 font-bold text-wicket-foreground transition-all hover:brightness-110 active:scale-[0.98]"
          >
            Confirm wicket
          </button>
          <button
            onClick={onCancel}
            className="rounded-md border border-scoreboard-border px-4 py-3.5 text-sm text-scoreboard-muted transition-colors hover:text-scoreboard-text"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Mandatory bottom sheet: pick the next batter (after a wicket) or the next
 * bowler (after an over). No cancel — the laws require the choice — but the
 * scorer can undo the last ball to back out of a mis-tap.
 */
function NextPlayerSheet({
  title,
  subtitle,
  candidates,
  emptyMessage,
  onSelect,
  onUndo,
  onEndInnings,
}: {
  title: string;
  subtitle: string;
  candidates: { id: string; label: string; tag?: string }[];
  emptyMessage: string;
  onSelect: (id: string) => void;
  onUndo: () => void;
  onEndInnings?: () => Promise<void>;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="safe-bottom w-full animate-slide-up rounded-t-2xl border-t border-scoreboard-border bg-scoreboard-panel p-5 text-scoreboard-text sm:max-w-md sm:rounded-2xl sm:border">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mb-4 mt-0.5 text-sm text-scoreboard-muted">{subtitle}</p>

        {candidates.length === 0 ? (
          <div className="rounded-md border border-dashed border-scoreboard-border p-4 text-center text-sm text-scoreboard-muted">
            {emptyMessage}
            {onEndInnings && (
              <form action={onEndInnings} className="mt-3">
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  End innings
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {candidates.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className="flex w-full items-center justify-between rounded-md bg-scoreboard px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-scoreboard/60"
              >
                <span className="truncate">{c.label}</span>
                {c.tag && (
                  <span className="ml-2 shrink-0 text-xs text-scoreboard-muted">{c.tag}</span>
                )}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={onUndo}
          className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-scoreboard-border px-4 py-2.5 text-sm text-scoreboard-muted transition-colors hover:text-scoreboard-text"
        >
          <Undo2 className="h-4 w-4" /> Undo last ball instead
        </button>
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
