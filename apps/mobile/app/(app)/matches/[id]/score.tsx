/**
 * The ball-by-ball scorer. The whole product.
 *
 * Three rules this screen is built around:
 *
 *   1. **The server owns the state.** Every delivery POSTs and the response is
 *      the replayed MatchState. Nothing is patched optimistically — a scorer
 *      whose phone briefly disagreed with the book is worse than one who waits
 *      200ms, and the engine is the only thing entitled to decide what a ball
 *      did.
 *
 *   2. **Mandatory sheets block scoring.** After a wicket, and after an over,
 *      the engine cannot validate the next ball until the replacement is
 *      named. Those sheets have no dismiss button on purpose.
 *
 *   3. **No ad ever appears here.** This is the scorer's screen — one person,
 *      240 taps, three hours. Ads live on the viewing surfaces. See TODO.md.
 */
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  asPlayerId,
  formatOvers,
  type BallEventInput,
  type BallEventType,
  type MatchState,
  type PlayerId,
} from '@open-innings/scoring';
import type { ScorerResponse, WicketTypeValue } from '@open-innings/shared';
import { api } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { useApiQuery, useApiMutation } from '../../../../lib/use-api';
import { Button, ErrorBanner, LoadingScreen } from '../../../../components/ui';
import { BallChip } from '../../../../components/scorer/BallChip';
import {
  ExtraRunsSheet,
  NextPlayerSheet,
  WicketSheet,
  type ExtraKind,
} from '../../../../components/scorer/Sheets';

export default function Scorer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token } = useSession();

  const query = useApiQuery<ScorerResponse>((t, signal) => api.scorer(t, id, signal), [id]);
  const mutation = useApiMutation();

  // The server's state supersedes the loaded one after every ball.
  const [live, setLive] = useState<MatchState | null>(null);

  const [showWicket, setShowWicket] = useState(false);
  const [pendingExtra, setPendingExtra] = useState<ExtraKind | null>(null);

  // Replacements chosen in the mandatory sheets. These ride along with the
  // *next* ball — that's how the engine learns about the change — and clear
  // once the server state reflects them.
  const [pendingBatterId, setPendingBatterId] = useState<string | null>(null);
  const [pendingBowlerId, setPendingBowlerId] = useState<string | null>(null);

  const applyState = useCallback((next: MatchState) => {
    setLive(next);
    setPendingBatterId(null);
    setPendingBowlerId(null);
  }, []);

  if (query.isLoading) return <LoadingScreen />;

  if (query.error || !query.data) {
    return (
      <SafeAreaView className="bg-scoreboard flex-1 justify-center p-6">
        <Stack.Screen options={{ title: 'Scorer' }} />
        <ErrorBanner message={query.error ?? 'Could not load this match.'} />
        <View className="mt-4">
          <Button label="Back to matches" onPress={() => router.replace('/matches')} />
        </View>
      </SafeAreaView>
    );
  }

  const data = query.data;
  const state = live ?? (data.state as MatchState);
  const inn = state.currentInnings;

  const nameOf = (playerId: PlayerId | string): string =>
    data.players.find((p) => p.id === String(playerId))?.fullName ?? String(playerId).slice(0, 6);

  // ── Innings break ─────────────────────────────────────────────────────────
  if (data.awaitingSecondInnings) {
    return (
      <InningsBreak
        matchId={id}
        firstInningsRuns={data.firstInningsRuns ?? 0}
        battingSquad={data.nextBattingSquad}
        bowlingSquad={data.nextBowlingSquad}
        onStarted={() => query.refresh()}
        onUndo={async () => {
          if (!token) return;
          const next = await mutation.run((t) => api.undoBall(t, id));
          if (next) await query.refresh();
        }}
        busy={mutation.busy}
        error={mutation.error}
      />
    );
  }

  // ── Effective on-field players ────────────────────────────────────────────
  // After a wicket the engine keeps the dismissed batter in state until the
  // next ball names the replacement. After a completed over it expects a
  // different bowlerId (Law 16.2). Every ball is built from these.
  const lastBall = state.balls[state.balls.length - 1];
  const pendingWicketId =
    lastBall?.wicketType &&
    lastBall.wicketPlayerId &&
    (lastBall.wicketPlayerId === inn.strikerId || lastBall.wicketPlayerId === inn.nonStrikerId)
      ? lastBall.wicketPlayerId
      : null;

  const needsBowlerChange =
    inn.ballsBowled > 0 && inn.ballsBowled % 6 === 0 && inn.lastBowlerId === inn.currentBowlerId;

  const effStriker =
    pendingWicketId === inn.strikerId && pendingBatterId
      ? asPlayerId(pendingBatterId)
      : inn.strikerId;
  const effNonStriker =
    pendingWicketId === inn.nonStrikerId && pendingBatterId
      ? asPlayerId(pendingBatterId)
      : inn.nonStrikerId;
  const effBowler =
    needsBowlerChange && pendingBowlerId ? asPlayerId(pendingBowlerId) : inn.currentBowlerId;

  const completed = inn.status === 'completed';

  async function send(ball: BallEventInput) {
    const next = await mutation.run((t) => api.postBall(t, id, ball));
    if (next) applyState(next);
  }

  async function undo() {
    const next = await mutation.run((t) => api.undoBall(t, id));
    if (next) applyState(next);
  }

  function scoreRuns(runsOffBat: number) {
    void send({
      inningsId: inn.id,
      // A dot is 'dot' in the event enum, never '0'.
      eventType: runsOffBat === 0 ? 'dot' : (String(runsOffBat) as BallEventType),
      runsOffBat,
      extraRuns: 0,
      totalRuns: runsOffBat,
      batsmanId: effStriker,
      nonStrikerId: effNonStriker,
      bowlerId: effBowler,
    });
  }

  function scoreExtra(kind: ExtraKind, totalRuns: number) {
    // A wide is never touched by the bat, so all of it is extras. A no-ball
    // carries a fixed 1-run penalty and anything beyond that was struck, so it
    // belongs to the batter. Byes and leg-byes are entirely extras.
    let runsOffBat: number;
    let extraRuns: number;
    if (kind === 'no_ball') {
      extraRuns = 1;
      runsOffBat = totalRuns - 1;
    } else {
      runsOffBat = 0;
      extraRuns = totalRuns;
    }

    setPendingExtra(null);
    void send({
      inningsId: inn.id,
      eventType: kind,
      runsOffBat,
      extraRuns,
      totalRuns,
      batsmanId: effStriker,
      nonStrikerId: effNonStriker,
      bowlerId: effBowler,
    });
  }

  function scoreWicket(type: WicketTypeValue, outBatterId: string, fielderId?: string) {
    setShowWicket(false);
    void send({
      inningsId: inn.id,
      eventType: 'wicket',
      runsOffBat: 0,
      extraRuns: 0,
      totalRuns: 0,
      batsmanId: effStriker,
      nonStrikerId: effNonStriker,
      bowlerId: effBowler,
      wicketType: type,
      wicketPlayerId: asPlayerId(outBatterId),
      fielderId: fielderId ? asPlayerId(fielderId) : undefined,
    });
  }

  // Mandatory sheets, in priority order — a wicket on the last ball of an over
  // needs the batter named first.
  const showBatterSheet = !completed && pendingWicketId !== null && !pendingBatterId;
  const showBowlerSheet = !completed && !showBatterSheet && needsBowlerChange && !pendingBowlerId;

  const batterCandidates = data.battingSquad.filter(
    (p) =>
      p.id !== String(effStriker) &&
      p.id !== String(effNonStriker) &&
      p.id !== String(pendingWicketId ?? '') &&
      !state.batting[p.id]?.isOut,
  );
  const bowlerCandidates = data.bowlingSquad.filter((p) => p.id !== String(inn.lastBowlerId ?? ''));

  // "This over" — falls back to the last over immediately after one ends.
  const currentOver = Math.floor(inn.ballsBowled / 6);
  let overBalls = state.balls.filter((b) => b.overNumber === currentOver);
  let overLabel = 'This over';
  if (overBalls.length === 0 && state.balls.length > 0) {
    overBalls = state.balls.filter((b) => b.overNumber === currentOver - 1);
    overLabel = 'Last over';
  }

  const ballsLeft = Math.max(0, state.match.oversPerInnings * 6 - inn.ballsBowled);
  const runsNeeded = inn.target !== undefined ? Math.max(0, inn.target - inn.runs) : undefined;

  const strikerStats = state.batting[String(effStriker)];
  const nonStrikerStats = state.batting[String(effNonStriker)];
  const bowlerStats = state.bowling[String(effBowler)];

  return (
    <SafeAreaView className="bg-scoreboard flex-1">
      <Stack.Screen options={{ title: 'Scorer', headerShown: false }} />

      <ScrollView contentContainerClassName="pb-4">
        {/* Header */}
        <View className="border-scoreboard-border flex-row items-center justify-between border-b px-4 py-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to matches"
            onPress={() => router.replace('/matches')}
            className="h-10 w-10 items-center justify-center rounded-full"
          >
            <Text className="text-scoreboard-muted text-xl">‹</Text>
          </Pressable>
          <Text
            className="text-scoreboard-text flex-1 text-center text-sm font-semibold"
            numberOfLines={1}
          >
            {data.matchTitle ?? `${data.battingTeamName} v ${data.bowlingTeamName}`}
          </Text>
          {completed ? (
            <View className="w-10" />
          ) : (
            <View className="bg-live rounded-full px-2 py-1">
              <Text className="text-live-foreground text-[10px] font-bold">LIVE</Text>
            </View>
          )}
        </View>

        {/* Score */}
        <View className="px-4 py-5">
          <Text className="text-scoreboard-muted text-xs font-bold uppercase tracking-widest">
            {data.battingTeamName}
          </Text>
          {/* shrink-0 on both: React Native gives Text inside a flex-row an
              implicit flexShrink, which silently clips it mid-word rather than
              wrapping or ellipsising. "(0.0)" rendered as "(0.0". */}
          <View className="mt-1 flex-row items-baseline gap-3">
            <Text className="text-scoreboard-text shrink-0 text-5xl font-bold">
              {inn.runs}-{inn.wickets}
            </Text>
            <Text className="text-scoreboard-muted shrink-0 text-xl">
              ({formatOvers(inn.ballsBowled)})
            </Text>
          </View>

          {runsNeeded !== undefined && !completed ? (
            <Text className="text-scoreboard-accent mt-2 text-sm font-semibold">
              Need {runsNeeded} from {ballsLeft} ball{ballsLeft === 1 ? '' : 's'}
            </Text>
          ) : null}

          {inn.isFreeHitNext && !completed ? (
            <View className="bg-extra mt-3 self-start rounded-full px-3 py-1">
              <Text className="text-extra-foreground text-xs font-bold">FREE HIT</Text>
            </View>
          ) : null}
        </View>

        {/* Batters + bowler */}
        <View className="border-scoreboard-border mx-4 rounded-2xl border">
          <BatterRow
            name={nameOf(effStriker)}
            onStrike
            runs={strikerStats?.runs ?? 0}
            balls={strikerStats?.balls ?? 0}
          />
          <BatterRow
            name={nameOf(effNonStriker)}
            runs={nonStrikerStats?.runs ?? 0}
            balls={nonStrikerStats?.balls ?? 0}
          />
          <View className="border-scoreboard-border flex-row items-center justify-between gap-3 border-t px-4 py-3">
            {/* The name may legitimately be long, so let it ellipsise rather
                than clip; the figures must never shrink. */}
            <Text className="text-scoreboard-muted flex-1 text-sm" numberOfLines={1}>
              {nameOf(effBowler)}
            </Text>
            <Text className="text-scoreboard-text shrink-0 text-sm font-semibold">
              {bowlerStats?.wickets ?? 0}-{bowlerStats?.runs ?? 0} (
              {formatOvers(bowlerStats?.balls ?? 0)})
            </Text>
          </View>
        </View>

        {/* Over strip */}
        <View className="mt-5 px-4">
          <Text className="text-scoreboard-muted mb-2 text-xs font-bold uppercase tracking-wide">
            {overLabel}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {overBalls.length === 0 ? (
              <Text className="text-scoreboard-muted shrink-0 text-sm">No balls yet.</Text>
            ) : (
              overBalls.map((b, i) => <BallChip key={`${b.ballNumber}-${i}`} ball={b} />)
            )}
          </View>
        </View>

        {mutation.error ? (
          <View className="mt-4 px-4">
            <ErrorBanner message={mutation.error} />
          </View>
        ) : null}

        {completed ? (
          <View className="border-scoreboard-border mx-4 mt-6 rounded-2xl border p-5">
            <Text className="text-scoreboard-text text-lg font-bold">Innings complete</Text>
            {data.matchSummary ? (
              <Text className="text-scoreboard-accent mt-1 text-base font-semibold">
                {data.matchSummary}
              </Text>
            ) : null}
            <View className="mt-4 gap-2">
              <Button label="Refresh" variant="secondary" onPress={() => void query.refresh()} />
              <Button label="Back to matches" onPress={() => router.replace('/matches')} />
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Keypad — pinned, thumb-reachable, one-handed */}
      {!completed ? (
        <View className="border-scoreboard-border border-t px-4 pb-2 pt-3">
          <View className="flex-row gap-2">
            {[0, 1, 2, 3].map((r) => (
              <RunKey key={r} runs={r} onPress={scoreRuns} disabled={mutation.busy} />
            ))}
          </View>
          <View className="mt-2 flex-row gap-2">
            <RunKey runs={4} onPress={scoreRuns} disabled={mutation.busy} tone="four" />
            <RunKey runs={6} onPress={scoreRuns} disabled={mutation.busy} tone="six" />
            <ActionKey
              label="W"
              tone="wicket"
              onPress={() => setShowWicket(true)}
              disabled={mutation.busy}
            />
            <ActionKey
              label="Undo"
              tone="muted"
              onPress={() => void undo()}
              disabled={mutation.busy || state.balls.length === 0}
            />
          </View>
          <View className="mt-2 flex-row gap-2">
            {(['wide', 'no_ball', 'bye', 'leg_bye'] as ExtraKind[]).map((kind) => (
              <ActionKey
                key={kind}
                label={{ wide: 'wd', no_ball: 'nb', bye: 'b', leg_bye: 'lb' }[kind]}
                tone="extra"
                onPress={() => setPendingExtra(kind)}
                disabled={mutation.busy}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* Sheets */}
      {showWicket ? (
        <WicketSheet
          strikerId={String(effStriker)}
          strikerName={nameOf(effStriker)}
          nonStrikerId={String(effNonStriker)}
          nonStrikerName={nameOf(effNonStriker)}
          players={data.players}
          onConfirm={scoreWicket}
          onCancel={() => setShowWicket(false)}
        />
      ) : null}

      {pendingExtra ? (
        <ExtraRunsSheet
          kind={pendingExtra}
          onConfirm={(runs) => scoreExtra(pendingExtra, runs)}
          onCancel={() => setPendingExtra(null)}
        />
      ) : null}

      {showBatterSheet ? (
        <NextPlayerSheet
          title="Next batter"
          subtitle={`${nameOf(pendingWicketId!)} ${
            lastBall?.wicketType === 'retired_hurt' ? 'retired hurt' : 'is out'
          } — who comes in?`}
          candidates={batterCandidates.map((p) => ({
            id: p.id,
            label: p.fullName,
            tag: state.batting[p.id]?.isRetiredHurt ? 'retired hurt' : undefined,
          }))}
          emptyMessage="No batters left in the squad."
          onSelect={setPendingBatterId}
          onUndo={() => void undo()}
          onEndInnings={async () => {
            const done = await mutation.run((t) => api.endInnings(t, id));
            if (done !== null) await query.refresh();
          }}
        />
      ) : null}

      {showBowlerSheet ? (
        <NextPlayerSheet
          title="New bowler"
          subtitle={`Over complete — ${nameOf(inn.currentBowlerId)} can't bowl two in a row (Law 16.2).`}
          candidates={bowlerCandidates.map((p) => ({ id: p.id, label: p.fullName }))}
          emptyMessage="No other bowler in the squad — add players to the team."
          onSelect={setPendingBowlerId}
          onUndo={() => void undo()}
        />
      ) : null}
    </SafeAreaView>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function BatterRow({
  name,
  onStrike = false,
  runs,
  balls,
}: {
  name: string;
  onStrike?: boolean;
  runs: number;
  balls: number;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 px-4 py-3">
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        {onStrike ? <View className="bg-scoreboard-accent h-2 w-2 shrink-0 rounded-full" /> : null}
        <Text
          numberOfLines={1}
          className={`flex-1 text-sm ${onStrike ? 'text-scoreboard-text font-semibold' : 'text-scoreboard-muted'}`}
        >
          {name}
        </Text>
      </View>
      {/* The figures are the point of the row — never let them be clipped. */}
      <Text className="text-scoreboard-text shrink-0 text-sm">
        {runs} <Text className="text-scoreboard-muted">({balls})</Text>
      </Text>
    </View>
  );
}

const KEY_TONES = {
  default: 'bg-scoreboard-panel',
  four: 'bg-four',
  six: 'bg-six',
  wicket: 'bg-wicket',
  extra: 'bg-extra',
  muted: 'bg-scoreboard-border',
} as const;

function RunKey({
  runs,
  onPress,
  disabled,
  tone = 'default',
}: {
  runs: number;
  onPress: (runs: number) => void;
  disabled: boolean;
  tone?: keyof typeof KEY_TONES;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={runs === 0 ? 'Dot ball' : `${runs} runs`}
      onPress={() => onPress(runs)}
      disabled={disabled}
      className={`${KEY_TONES[tone]} h-16 flex-1 items-center justify-center rounded-2xl ${
        disabled ? 'opacity-40' : 'active:opacity-70'
      }`}
    >
      <Text className="text-scoreboard-text text-2xl font-bold">{runs === 0 ? '•' : runs}</Text>
    </Pressable>
  );
}

function ActionKey({
  label,
  tone,
  onPress,
  disabled,
}: {
  label: string;
  tone: keyof typeof KEY_TONES;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      className={`${KEY_TONES[tone]} h-16 flex-1 items-center justify-center rounded-2xl ${
        disabled ? 'opacity-40' : 'active:opacity-70'
      }`}
    >
      <Text className="text-scoreboard-text text-base font-bold">{label}</Text>
    </Pressable>
  );
}

// ─── Innings break ───────────────────────────────────────────────────────────

function InningsBreak({
  matchId,
  firstInningsRuns,
  battingSquad,
  bowlingSquad,
  onStarted,
  onUndo,
  busy,
  error,
}: {
  matchId: string;
  firstInningsRuns: number;
  battingSquad: { id: string; fullName: string }[];
  bowlingSquad: { id: string; fullName: string }[];
  onStarted: () => void;
  onUndo: () => void;
  busy: boolean;
  error: string | null;
}) {
  const { token } = useSession();
  const router = useRouter();
  const [strikerId, setStrikerId] = useState<string | null>(null);
  const [nonStrikerId, setNonStrikerId] = useState<string | null>(null);
  const [bowlerId, setBowlerId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  async function start() {
    setLocalError(null);
    if (!strikerId || !nonStrikerId || !bowlerId) {
      setLocalError('Pick both opening batters and the opening bowler.');
      return;
    }
    if (strikerId === nonStrikerId) {
      setLocalError('Striker and non-striker must be different players.');
      return;
    }
    if (!token) return;

    try {
      await api.startSecondInnings(token, matchId, {
        openingStrikerId: strikerId,
        openingNonStrikerId: nonStrikerId,
        openingBowlerId: bowlerId,
      });
      onStarted();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not start the second innings.');
    }
  }

  return (
    <SafeAreaView className="bg-scoreboard flex-1">
      <Stack.Screen options={{ title: 'Innings break', headerShown: false }} />
      <ScrollView contentContainerClassName="p-5 gap-6">
        <View>
          <Text className="text-scoreboard-accent text-xs font-bold uppercase tracking-widest">
            Innings break
          </Text>
          <Text className="text-scoreboard-text mt-1 text-2xl font-bold">
            Target {firstInningsRuns + 1}
          </Text>
          <Text className="text-scoreboard-muted mt-1 text-sm">
            First innings finished on {firstInningsRuns}. Pick the openers for the chase.
          </Text>
        </View>

        {localError || error ? <ErrorBanner message={localError ?? error ?? ''} /> : null}

        <OpenerPicker
          label="Striker"
          options={battingSquad}
          selected={strikerId}
          disabledId={nonStrikerId}
          onSelect={setStrikerId}
        />
        <OpenerPicker
          label="Non-striker"
          options={battingSquad}
          selected={nonStrikerId}
          disabledId={strikerId}
          onSelect={setNonStrikerId}
        />
        <OpenerPicker
          label="Opening bowler"
          options={bowlingSquad}
          selected={bowlerId}
          onSelect={setBowlerId}
        />

        <Button label="Start the chase" onPress={start} loading={busy} />
        {/* The usual reason to be here wrongly is a mis-recorded final ball. */}
        <Button label="Undo last ball" variant="ghost" onPress={onUndo} />
        <Button
          label="Back to matches"
          variant="ghost"
          onPress={() => router.replace('/matches')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function OpenerPicker({
  label,
  options,
  selected,
  disabledId,
  onSelect,
}: {
  label: string;
  options: { id: string; fullName: string }[];
  selected: string | null;
  disabledId?: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-scoreboard-muted text-xs font-bold uppercase tracking-wide">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((p) => {
          const isSelected = p.id === selected;
          const isDisabled = p.id === disabledId;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, disabled: isDisabled }}
              disabled={isDisabled}
              onPress={() => onSelect(p.id)}
              className={`min-h-12 shrink-0 justify-center rounded-xl px-4 ${
                isSelected ? 'bg-primary' : 'bg-scoreboard-panel'
              } ${isDisabled ? 'opacity-40' : ''}`}
            >
              <Text
                className={`text-sm ${isSelected ? 'font-bold text-white' : 'text-scoreboard-text'}`}
              >
                {p.fullName}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
