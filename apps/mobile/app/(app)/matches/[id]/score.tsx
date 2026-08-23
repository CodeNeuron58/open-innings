/**
 * The ball-by-ball scorer. Server owns state, mandatory sheets block scoring,
 * and no ads are shown here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
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
import type {
  BallCorrectionChange,
  PatchBallInput,
  ScorerResponse,
  WicketTypeValue,
} from '@open-innings/shared';
import { EXTRA_LABELS, splitExtra } from '../../../../lib/deliveries';
import { api } from '../../../../lib/api';
import { requestIdFor, type PendingDelivery } from '../../../../lib/request-id';
import { useSession } from '../../../../lib/session';
import { useSettings } from '../../../../lib/settings';
import { useApiQuery, useApiMutation } from '../../../../lib/use-api';
import { Button, ErrorBanner, LoadingScreen } from '../../../../components/ui';
import { BallChip } from '../../../../components/scorer/BallChip';
import { CorrectBallSheet } from '../../../../components/scorer/CorrectBall';
import { EndOfOver } from '../../../../components/scorer/EndOfOver';
import { InningsBreak } from '../../../../components/scorer/InningsBreak';
import {
  ExtraRunsSheet,
  NextPlayerSheet,
  WicketSheet,
  type ExtraKind,
} from '../../../../components/scorer/Sheets';

export default function Scorer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  // Read directly by `correctBall`, which is the one call on this screen that
  // does not go through useApiMutation. It needs its own error state: a
  // refusal there is an answer about a specific delivery, not a failed save,
  // and it belongs in the sheet rather than the banner at the top.
  const { token } = useSession();
  const { keepAwakeWhileScoring } = useSettings();

  // Keep screen awake while scoring. Uses activateKeepAwakeAsync (not useKeepAwake)
  // so the setting can be toggled. Released on unmount via the 'scorer' tag.
  useEffect(() => {
    if (!keepAwakeWhileScoring) return;
    void activateKeepAwakeAsync('scorer');
    return () => {
      // Throws if the lock was already released — which is not worth
      // surfacing to someone in the middle of scoring an over.
      try {
        deactivateKeepAwake('scorer');
      } catch {
        /* already released */
      }
    };
  }, [keepAwakeWhileScoring]);

  const query = useApiQuery<ScorerResponse>((t, signal) => api.scorer(t, id, signal), [id]);

  // The server's state supersedes the loaded one after every ball.
  const [live, setLive] = useState<MatchState | null>(null);

  /*
   * Re-read from the server, and stop preferring the copy we already had.
   *
   * `state` is `live ?? data.state`, so once a ball has been scored `live`
   * shadows every later fetch — permanently, because nothing cleared it.
   * Refreshing therefore fetched newer state and kept showing the older one.
   *
   * The visible cost was the second innings. Innings 1 ends, `live` holds its
   * completed state, the break opens (it reads `data`, not `state`, so that
   * part worked), the scorer starts innings 2 — and the screen falls back to
   * `live`, sees `status: 'completed'`, and renders "Innings complete" again,
   * with a Refresh button that could not help because it did not clear `live`
   * either. The only way out was leaving the screen and coming back, which
   * remounts and resets it.
   *
   * Clearing is always safe: `live` is never an optimistic guess, it is the
   * server's own reply to the last ball. A fresher read supersedes it by
   * definition.
   *
   * Declared here, above `useApiMutation`, because `onConflict` calls it —
   * and the React Compiler will not compile a component that reaches forward
   * to a binding declared later.
   */
  const reload = async () => {
    setLive(null);
    await query.refresh();
  };

  // A conflict means the server already recorded this ball.
  // Reload the state instead of failing.
  const [conflictNote, setConflictNote] = useState<string | null>(null);
  const mutation = useApiMutation({
    onConflict: (code) => {
      setConflictNote(
        code === 'ALREADY_UNDONE'
          ? 'That ball was already undone. Reloaded.'
          : 'That ball was already recorded. Reloaded.',
      );
      void reload();
    },
  });

  const [showWicket, setShowWicket] = useState(false);
  // State for correcting a previous delivery.
  // Kept open on success to show what the correction changed.
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionChanges, setCorrectionChanges] = useState<BallCorrectionChange[] | null>(null);
  const [pendingExtra, setPendingExtra] = useState<ExtraKind | null>(null);

  // Replacements chosen in the mandatory sheets. These ride along with the
  // *next* ball — that's how the engine learns about the change — and clear
  // once the server state reflects them.
  const [pendingBatterId, setPendingBatterId] = useState<string | null>(null);
  const [pendingBowlerId, setPendingBowlerId] = useState<string | null>(null);

  // Law 17.4 exception: bowler cannot continue mid-over.
  // This flag must be stored on the delivery itself for replay validation.
  const [midOverBowlerId, setMidOverBowlerId] = useState<string | null>(null);
  const [pickingMidOverBowler, setPickingMidOverBowler] = useState(false);

  /*
   * The delivery that has been sent and whose outcome we do not know.
   *
   * Migration 0013 gave the server a way to recognise a resent delivery, and
   * this is the half that makes it mean anything: the id has to survive a
   * failed attempt, or every retry looks like a new ball and the server has
   * nothing to match on. Until now the client minted a fresh one per call, so
   * a lost response still recorded the delivery twice — the exact ground-side
   * case 0013 was written for.
   *
   * The id is keyed on the delivery itself rather than held blindly, and that
   * distinction is the whole correctness argument:
   *
   *   Same delivery resent. A failed send never calls `applyState`, so the
   *   striker, non-striker and bowler are unchanged and tapping 4 again
   *   composes a byte-identical ball. Same signature, same id — and if the
   *   first attempt had in fact committed, the server answers with the
   *   success whose response was lost, which is precisely right.
   *
   *   A different delivery. New signature, new id. Reusing one here would be
   *   the dangerous failure: the server would recognise the old id and return
   *   the earlier ball's state, silently swallowing the new delivery.
   *
   * Success clears it, so two identical dot balls in a row are two balls.
   */
  const pending = useRef<PendingDelivery | null>(null);

  /*
   * Re-read from the server, and stop preferring the copy we already had.
   *
   * `state` is `live ?? data.state`, so once a ball has been scored `live`
   * shadows every later fetch — permanently, because nothing cleared it.
   * Refreshing therefore fetched newer state and kept showing the older one.
   *
   * The visible cost was the second innings. Innings 1 ends, `live` holds its
   * completed state, the break opens (it reads `data`, not `state`, so that
   * part worked), the scorer starts innings 2 — and the screen falls back to
   * `live`, sees `status: 'completed'`, and renders "Innings complete" again.
   * With a Refresh button that could not help, because it did not clear
   * `live` either. The only way out was leaving the screen and coming back,
   * which remounts and resets it.
   *
   * Clearing is always safe: `live` is never an optimistic guess, it is the
   * server's own reply to the last ball. A fresher read supersedes it by
   * definition.
   */
  const applyState = useCallback((next: MatchState) => {
    setLive(next);
    setPendingBatterId(null);
    setPendingBowlerId(null);
    // The replacement is on the server now; the flag must not ride a second
    // delivery, or every ball of the over would claim an injury.
    setMidOverBowlerId(null);
  }, []);

  // A finished match is a result, not a console. Redirected rather than
  // rendered inline so the back stack does not return to a scoring screen
  // that can no longer accept a ball.
  const matchCompleted = query.data?.matchStatus === 'completed';
  useEffect(() => {
    // Object form rather than a template string: Expo's typegen currently
    // registers this route as static, so the interpolated form does not
    // typecheck. This is the documented API and substitutes [id] correctly.
    if (matchCompleted) router.replace({ pathname: '/matches/[id]/result', params: { id } });
  }, [matchCompleted, id, router]);

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

  // Safely look up the correcting ball.
  // Avoids a crash if the ball is removed (e.g. via an undo on another device).
  const correctingBall = correcting
    ? (state.balls.find((b) => String(b.id) === correcting) ?? null)
    : null;

  const nameOf = (playerId: PlayerId | string): string =>
    data.players.find((p) => p.id === String(playerId))?.fullName ?? String(playerId).slice(0, 6);

  // ── Innings break ─────────────────────────────────────────────────────────
  // `state` here is still innings 1 — the chase has not been opened, so that
  // is what /scorer replays. Which is exactly what the break needs to show.
  if (data.awaitingSecondInnings) {
    return (
      <InningsBreak
        matchId={id}
        state={state}
        battingTeamName={data.battingTeamName}
        chasingTeamName={data.bowlingTeamName}
        nameOf={nameOf}
        battingSquad={data.nextBattingSquad}
        bowlingSquad={data.nextBowlingSquad}
        watching={data.watching}
        // Both go through mutation.run so a failure lands in `mutation.error`
        // and is rendered, rather than becoming an unhandled rejection.
        onStart={async (openers) => {
          const started = await mutation.run((t) => api.startNextInnings(t, id, openers));
          if (started !== null) await reload();
        }}
        onUndo={async () => {
          const next = await mutation.run((t) => api.undoBall(t, id));
          if (next) await reload();
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
  const effBowler = midOverBowlerId
    ? asPlayerId(midOverBowlerId)
    : needsBowlerChange && pendingBowlerId
      ? asPlayerId(pendingBowlerId)
      : inn.currentBowlerId;

  // Check if over is in progress (using balls logged rather than ball count).
  const overInProgress = state.balls.some((b) => b.overNumber === Math.floor(inn.ballsBowled / 6));

  const completed = inn.status === 'completed';

  async function send(ball: BallEventInput): Promise<MatchState | null> {
    pending.current = requestIdFor(pending.current, JSON.stringify(ball));
    const { requestId } = pending.current;

    const next = await mutation.run((t) => api.postBall(t, id, ball, requestId));
    if (next) {
      pending.current = null;
      applyState(next);
    }
    return next;
  }

  async function undo() {
    const next = await mutation.run((t) => api.undoBall(t, id));
    if (next) applyState(next);
  }

  // Replace one delivery and let the server replay the rest of the innings.
  // Not through mutation.run so errors render inside the sheet.
  async function correctBall(patch: Omit<PatchBallInput, 'bowlerId'>) {
    const ballId = correcting;
    if (!ballId || !token) return;

    const target = state.balls.find((b) => String(b.id) === ballId);
    if (!target) return;

    setCorrectionError(null);
    setCorrectionBusy(true);
    try {
      const result = await api.correctBall(token, id, ballId, {
        ...patch,
        // The bowler is not being corrected here, so it is carried across
        // rather than re-asserted — sending a different one would silently
        // reassign the over.
        bowlerId: String(target.bowlerId),
      } as PatchBallInput);
      applyState(result.state);
      setCorrectionChanges(result.changes);
    } catch (err) {
      setCorrectionError(
        err instanceof Error ? err.message : 'That correction could not be applied.',
      );
    } finally {
      setCorrectionBusy(false);
    }
  }

  function closeCorrection() {
    setCorrecting(null);
    setCorrectionError(null);
    setCorrectionChanges(null);
  }

  function scoreRuns(runsOffBat: RunKey) {
    void send({
      inningsId: inn.id,
      eventType: RUN_EVENT_TYPE[runsOffBat],
      runsOffBat,
      extraRuns: 0,
      totalRuns: runsOffBat,
      batsmanId: effStriker,
      nonStrikerId: effNonStriker,
      bowlerId: effBowler,
      bowlerReplacedMidOver: midOverBowlerId !== null,
    });
  }

  function scoreExtra(kind: ExtraKind, totalRuns: number) {
    // The split — a no-ball's penalty is the extra and the rest was struck —
    // lives in lib/deliveries.ts, because the correction sheet needs exactly
    // the same rule and the copy it started with was wrong.
    const { runsOffBat, extraRuns } = splitExtra(kind, totalRuns);

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
      bowlerReplacedMidOver: midOverBowlerId !== null,
    });
  }

  async function scoreWicket(
    type: WicketTypeValue,
    outBatterId: string,
    fielderId?: string,
    nextBatterId?: string,
  ) {
    setShowWicket(false);
    // Through `send`, so a wicket gets the same retry protection every other
    // delivery has — it was the one path that bypassed it.
    const next = await send({
      inningsId: inn.id,
      eventType: 'wicket',
      runsOffBat: 0,
      extraRuns: 0,
      totalRuns: 0,
      batsmanId: effStriker,
      nonStrikerId: effNonStriker,
      bowlerId: effBowler,
      bowlerReplacedMidOver: midOverBowlerId !== null,
      wicketType: type,
      wicketPlayerId: asPlayerId(outBatterId),
      fielderId: fielderId ? asPlayerId(fielderId) : undefined,
    });
    if (!next) return;

    // The replacement was named in the same sheet as the dismissal, so the
    // mandatory batter sheet never has to appear. Set *after* applyState,
    // which clears the pending pair — and not at all if that wicket ended the
    // innings, because then nobody is coming in.
    if (nextBatterId && next.currentInnings.status !== 'completed') {
      setPendingBatterId(nextBatterId);
    }
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
  // "This over" — falls back to the last over immediately after one ends.
  const currentOver = Math.floor(inn.ballsBowled / 6);
  let overBalls = state.balls.filter((b) => b.overNumber === currentOver);
  let overLabel = 'This over';
  if (overBalls.length === 0 && state.balls.length > 0) {
    overBalls = state.balls.filter((b) => b.overNumber === currentOver - 1);
    overLabel = 'Last over';
  }

  // The innings' own length where it has one. A Super Over is one over inside
  // a twenty-over match, so the match figure would show nineteen overs left.
  const inningsOvers = inn.oversPerInnings ?? state.match.oversPerInnings;
  const ballsLeft = Math.max(0, inningsOvers * 6 - inn.ballsBowled);
  const runsNeeded = inn.target !== undefined ? Math.max(0, inn.target - inn.runs) : undefined;

  const strikerStats = state.batting[String(effStriker)];
  const nonStrikerStats = state.batting[String(effNonStriker)];
  const bowlerStats = state.bowling[String(effBowler)];

  const runsThisOver = overBalls.reduce((sum, b) => sum + b.totalRuns, 0);
  const legalThisOver = overBalls.filter(
    (b) => b.eventType !== 'wide' && b.eventType !== 'no_ball',
  ).length;

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ title: 'Scorer', headerShown: false }} />

      {/* Match bar */}
      <View className="border-border flex-row items-center gap-2.5 border-b px-3.5 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to matches"
          onPress={() => router.replace('/matches')}
          className="h-10 w-8 items-center justify-center"
        >
          <Text className="text-foreground/70 text-xl">‹</Text>
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text className="text-foreground font-heading text-[15px]" numberOfLines={1}>
            {data.battingTeamName} <Text className="text-foreground/45">v</Text>{' '}
            {data.bowlingTeamName}
          </Text>
          <Text
            className="font-heading text-[9px] uppercase tracking-[1.3px] text-neutral-600"
            numberOfLines={1}
          >
            {state.match.oversPerInnings} overs {' · '} {inn.inningsNumber === 1 ? '1st' : '2nd'}{' '}
            innings
          </Text>
        </View>
        {!completed ? (
          <View className="flex-row items-center gap-1.5">
            <View className="bg-primary h-1.5 w-1.5" />
            <Text className="text-steel-700 font-heading text-[9px] uppercase tracking-[1.3px]">
              Live
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerClassName="pb-2">
        {/* Score plate — the one reversed field on the screen */}
        <View className="bg-scoreboard px-4 pb-3.5 pt-3.5">
          <View className="flex-row items-end gap-3">
            {/* shrink-0 throughout: RN gives Text in a flex-row an implicit
                flexShrink and clips mid-word rather than wrapping. */}
            <Text className="text-scoreboard-text font-heading shrink-0 text-[58px] leading-[50px]">
              {inn.runs}-{inn.wickets}
            </Text>
            <View className="shrink-0 pb-1.5">
              <Text className="text-scoreboard-text font-heading text-[19px] leading-[19px] opacity-90">
                {formatOvers(inn.ballsBowled)}
              </Text>
              <Text className="text-scoreboard-text font-heading mt-0.5 text-[9px] uppercase tracking-[1.3px] opacity-60">
                Overs
              </Text>
            </View>
            {inn.target !== undefined ? (
              <View className="ml-auto shrink-0 items-end pb-1">
                <Text className="text-scoreboard-text font-heading text-[9px] uppercase tracking-[1.3px] opacity-60">
                  Target
                </Text>
                <Text className="text-scoreboard-text font-heading text-[19px] leading-[22px]">
                  {inn.target}
                </Text>
              </View>
            ) : null}
          </View>

          <View className="border-scoreboard-text/25 mt-3 flex-row gap-4 border-t pt-2.5">
            <Rate label="CRR" value={rate(inn.runs, inn.ballsBowled)} />
            {runsNeeded !== undefined && !completed ? (
              <>
                <Rate label="RRR" value={rate(runsNeeded, ballsLeft)} />
                <Text className="text-scoreboard-text font-heading ml-auto shrink-0 text-[14px]">
                  Need {runsNeeded} off {ballsLeft}
                </Text>
              </>
            ) : null}
          </View>

          {inn.isFreeHitNext && !completed ? (
            <View className="border-amber-400/60 bg-amber-400/20 mt-3 flex-row items-center justify-between border px-3 py-2">
              <View className="flex-row items-center gap-2">
                <View className="h-2 w-2 bg-amber-400" />
                <Text className="text-amber-300 font-heading text-[12px] font-bold uppercase tracking-[1.8px]">
                  FREE HIT
                </Text>
              </View>
              <Text className="text-amber-200/90 font-heading text-[10px] uppercase tracking-[1.2px]">
                Only Run Out & Obstruction (Law 21.18)
              </Text>
            </View>
          ) : null}
        </View>

        {/* Batters */}
        <View className="border-border border-b px-4">
          <View className="border-border flex-row border-b pb-1.5 pt-2">
            <Text className="font-heading flex-1 text-[9px] uppercase tracking-[1.3px] text-neutral-600">
              Batting
            </Text>
            {['R', 'B', '4s', '6s', 'SR'].map((h, i) => (
              <Text
                key={h}
                className={`font-heading text-right text-[9px] uppercase tracking-[1.3px] text-neutral-600 ${COL[i]}`}
              >
                {h}
              </Text>
            ))}
          </View>
          <BatterRow name={nameOf(effStriker)} onStrike stats={strikerStats} />
          <BatterRow name={nameOf(effNonStriker)} stats={nonStrikerStats} />
        </View>

        {/* Bowler. Pressable mid-over only (Law 17.4 exception). */}
        <Pressable
          accessibilityRole={overInProgress && !completed ? 'button' : 'none'}
          accessibilityLabel={
            overInProgress && !completed
              ? `Bowling: ${nameOf(effBowler)}. Tap to change if they cannot continue.`
              : `Bowling: ${nameOf(effBowler)}`
          }
          onPress={() => setPickingMidOverBowler(true)}
          disabled={!overInProgress || completed || mutation.busy}
          className="border-border flex-row items-center gap-2.5 border-b px-4 py-2 active:opacity-70"
        >
          <Text className="font-heading shrink-0 text-[9px] uppercase tracking-[1.3px] text-neutral-600">
            Bowling
          </Text>
          <Text className="text-foreground min-w-0 flex-1 text-[13.5px]" numberOfLines={1}>
            {nameOf(effBowler)}
            {midOverBowlerId ? (
              <Text className="text-steel-700 font-heading text-[11px]"> · replacing (Law 17.4)</Text>
            ) : null}
          </Text>
          {overInProgress && !completed && !midOverBowlerId ? (
            <View className="border-steel-400 bg-steel-100 border px-1.5 py-0.5">
              <Text className="text-steel-800 font-heading text-[9px] uppercase tracking-[1px]">
                Change
              </Text>
            </View>
          ) : null}
          <Text className="text-foreground font-heading shrink-0 text-[13.5px]">
            {formatOvers(bowlerStats?.balls ?? 0)}–{bowlerStats?.maidens ?? 0}–
            {bowlerStats?.runs ?? 0}–{bowlerStats?.wickets ?? 0}
          </Text>
          <Text className="text-foreground/60 font-heading shrink-0 text-[12px]">
            {rate(bowlerStats?.runs ?? 0, bowlerStats?.balls ?? 0)}
          </Text>
        </Pressable>

        {/* This over */}
        <View className="px-4 pb-3.5 pt-3">
          <View className="mb-2 flex-row items-baseline">
            <Text className="text-steel-700 font-heading shrink-0 text-[9px] uppercase tracking-[1.3px]">
              {overLabel}
            </Text>
            <Text className="text-foreground/55 font-heading ml-auto shrink-0 text-[12px]">
              {runsThisOver} run{runsThisOver === 1 ? '' : 's'} this over
            </Text>
          </View>
          <View className="flex-row flex-wrap gap-1.5">
            {overBalls.map((b, i) => (
              <BallChip
                key={`${b.ballNumber}-${i}`}
                ball={b}
                // Only while the innings is live. Correcting a delivery in a
                // closed innings would have to reopen a finished match and
                // invalidate a result already shared, which is a different
                // feature and is refused by the server too.
                onPress={completed ? undefined : () => setCorrecting(String(b.id))}
              />
            ))}
            {/* The balls not yet bowled — drawn, not filled. */}
            {Array.from({ length: Math.max(0, 6 - legalThisOver) }).map((_, i) => (
              <View key={`empty-${i}`} className="border-border/40 h-9 w-9 border border-dashed" />
            ))}
          </View>
        </View>

        {mutation.error ? (
          <View className="px-4 pb-2">
            <ErrorBanner message={mutation.error} />
          </View>
        ) : null}

        {/* Not an error — the server was ahead of the screen, and now is not. */}
        {conflictNote ? (
          <Pressable onPress={() => setConflictNote(null)} className="px-4 pb-2">
            <View className="border-steel-300 bg-steel-100 border p-2.5">
              <Text className="text-steel-900 text-[12.5px]">{conflictNote}</Text>
            </View>
          </Pressable>
        ) : null}

        {/* Completed innings but awaiting second innings. */}
        {completed ? (
          <View className="border-border mx-4 mb-4 border p-5">
            <Text className="text-foreground font-heading text-lg uppercase">Innings complete</Text>
            {data.matchSummary ? (
              <Text className="text-steel-700 mt-1 text-base">{data.matchSummary}</Text>
            ) : null}
            <View className="mt-4 gap-2">
              <Button label="Refresh" variant="secondary" onPress={() => void reload()} />
              <Button
                label="See the result"
                variant="secondary"
                onPress={() => router.push({ pathname: '/matches/[id]/result', params: { id } })}
              />
              <Button label="Back to matches" onPress={() => router.replace('/matches')} />
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* The console — pinned, thumb-reachable, one-handed */}
      {!completed ? (
        <View className="px-3 pb-3">
          <View className="border-border relative border bg-neutral-100 p-2.5">
            {/* Extras are armed modifiers above the keypad, not a second
                keypad: arm one, tap the runs, and it is charged correctly. */}
            <View className="mb-2 flex-row gap-1.5">
              {(['wide', 'no_ball', 'bye', 'leg_bye'] as ExtraKind[]).map((kind) => (
                <Pressable
                  key={kind}
                  accessibilityRole="button"
                  accessibilityState={{ selected: pendingExtra === kind }}
                  onPress={() => setPendingExtra(kind)}
                  disabled={mutation.busy}
                  className={`h-9 flex-1 items-center justify-center border ${
                    pendingExtra === kind
                      ? 'bg-primary border-primary'
                      : 'border-border bg-transparent'
                  } ${mutation.busy ? 'opacity-40' : 'active:opacity-70'}`}
                >
                  <Text
                    className={`font-heading text-[12px] ${
                      pendingExtra === kind ? 'text-primary-foreground' : 'text-foreground'
                    }`}
                  >
                    {EXTRA_LABELS[kind]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* 0–6 and W, on one hairline grid. */}
            <View className="border-border flex-row flex-wrap border-l border-t">
              {KEYS.map((k) => (
                <Key
                  key={k.label}
                  {...k}
                  onPress={() => (k.runs === undefined ? setShowWicket(true) : scoreRuns(k.runs))}
                  disabled={mutation.busy}
                />
              ))}
            </View>

            <View className="mt-2 flex-row items-center gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Undo last ball"
                onPress={() => void undo()}
                disabled={mutation.busy || state.balls.length === 0}
                className={`border-border h-9 flex-row items-center justify-center border px-3 ${
                  mutation.busy || state.balls.length === 0 ? 'opacity-40' : 'active:opacity-70'
                }`}
              >
                <Text className="text-foreground font-heading text-[13px]">↩ Undo</Text>
              </Pressable>
              {lastBall ? (
                <Text className="font-heading text-[11.5px] text-neutral-600">
                  Last: {lastBall.totalRuns}
                </Text>
              ) : null}
              {pendingExtra ? (
                <Text className="text-steel-700 font-heading ml-auto text-[9px] uppercase tracking-[1.3px]">
                  {EXTRA_LABELS[pendingExtra]} armed
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {/* Sheets */}
      {correctingBall ? (
        <CorrectBallSheet
          ball={correctingBall}
          position={positionOf(state, correcting!)}
          busy={correctionBusy}
          error={correctionError}
          changes={correctionChanges}
          onCorrect={(patch) => void correctBall(patch)}
          onDismiss={closeCorrection}
        />
      ) : null}

      {showWicket ? (
        <WicketSheet
          strikerId={String(effStriker)}
          strikerName={nameOf(effStriker)}
          nonStrikerId={String(effNonStriker)}
          nonStrikerName={nameOf(effNonStriker)}
          // Only the fielding side can be credited with a catch or a run-out.
          // This used to offer both squads, which let a scorer credit the
          // catch to a batter.
          fielders={data.bowlingSquad}
          nextBatters={batterCandidates}
          // Law 21.18 narrows the sheet rather than letting the tap be refused.
          isFreeHit={inn.isFreeHitNext}
          onConfirm={(type, outId, fielderId, nextId) =>
            void scoreWicket(type, outId, fielderId, nextId)
          }
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
            if (done !== null) await reload();
          }}
        />
      ) : null}

      {pickingMidOverBowler ? (
        <NextPlayerSheet
          title="Change bowler"
          subtitle="Only if this bowler cannot continue — Law 17.4. The over carries on from where it is."
          candidates={data.bowlingSquad
            .filter(
              (p) => p.id !== String(inn.currentBowlerId) && p.id !== String(inn.lastBowlerId),
            )
            .map((p) => ({
              id: p.id,
              label: p.fullName,
              tag: state.bowling[p.id] ? formatOvers(state.bowling[p.id]!.balls) : undefined,
            }))}
          emptyMessage="Nobody else in the squad can take over this over."
          onSelect={(playerId) => {
            setMidOverBowlerId(playerId);
            setPickingMidOverBowler(false);
          }}
          onCancel={() => setPickingMidOverBowler(false)}
        />
      ) : null}

      {showBowlerSheet ? (
        <EndOfOver
          oversCompleted={Math.floor(inn.ballsBowled / 6)}
          oversPerInnings={inningsOvers}
          // The match's own limit, enforced by the engine. Undefined means it
          // set none, and the screen must not invent one.
          maxOversPerBowler={inn.maxOversPerBowler}
          runs={inn.runs}
          wickets={inn.wickets}
          target={inn.target}
          ballsRemaining={ballsLeft}
          overBalls={overBalls}
          lastBowlerId={String(inn.currentBowlerId)}
          lastBowlerName={nameOf(inn.currentBowlerId)}
          lastBowlerStats={state.bowling[String(inn.currentBowlerId)]}
          // The whole bowling side — EndOfOver holds out the last bowler
          // itself, so it can show them struck through rather than vanished.
          candidates={data.bowlingSquad.map((p) => ({
            id: p.id,
            fullName: p.fullName,
            stats: state.bowling[p.id],
          }))}
          strikerName={nameOf(inn.strikerId)}
          strikerRuns={state.batting[String(inn.strikerId)]?.runs ?? 0}
          strikerBalls={state.batting[String(inn.strikerId)]?.balls ?? 0}
          onConfirm={setPendingBowlerId}
          onUndo={() => void undo()}
          busy={mutation.busy}
        />
      ) : null}
    </SafeAreaView>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

/** Column widths for the batting table, matching the design's grid. */
const COL = ['w-[34px]', 'w-[30px]', 'w-[26px]', 'w-[30px]', 'w-[42px]'] as const;

// Run keys for the scorer keypad.
type RunKey = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Maps numeric run values to strict event types for the engine.
const RUN_EVENT_TYPE: Record<RunKey, BallEventType> = {
  0: 'dot', // never '0' — the enum spells a dot out
  1: '1',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
};

/** A key either records runs or opens the wicket sheet, never both. */
const KEYS: { label: string; runs?: RunKey; tone: string; text: string }[] = [
  { label: '0', runs: 0, tone: 'bg-background', text: 'text-foreground' },
  { label: '1', runs: 1, tone: 'bg-background', text: 'text-foreground' },
  { label: '2', runs: 2, tone: 'bg-background', text: 'text-foreground' },
  { label: '3', runs: 3, tone: 'bg-background', text: 'text-foreground' },
  { label: '4', runs: 4, tone: 'bg-four', text: 'text-four-foreground' },
  { label: '5', runs: 5, tone: 'bg-background', text: 'text-foreground' },
  { label: '6', runs: 6, tone: 'bg-six', text: 'text-six-foreground' },
  { label: 'W', tone: 'bg-wicket', text: 'text-wicket-foreground' },
];

/**
 * `1.4` — where a delivery sits, the way a scorer would call it.
 *
 * Counted from the ball log rather than stored, because the position of every
 * delivery after a correction is exactly the thing that can move.
 */
function positionOf(state: MatchState, ballId: string): string {
  const ball = state.balls.find((b) => String(b.id) === ballId);
  if (!ball) return '';
  const legal = state.balls.filter(
    (b) => b.overNumber === ball.overNumber && b.isLegalDelivery && b.ballNumber <= ball.ballNumber,
  ).length;
  return `${ball.overNumber + 1}.${Math.max(1, legal)}`;
}

/** Runs per over, or a strike rate — one helper, both are runs ÷ balls. */
function rate(runs: number, balls: number): string {
  if (balls <= 0) return '0.00';
  return ((runs / balls) * 6).toFixed(2);
}

function strikeRate(runs: number, balls: number): string {
  if (balls <= 0) return '0.0';
  return ((runs / balls) * 100).toFixed(1);
}

function Rate({ label, value }: { label: string; value: string }) {
  return (
    <View className="shrink-0 flex-row items-baseline gap-1">
      <Text className="text-scoreboard-text font-heading text-[9px] uppercase tracking-[1.3px] opacity-60">
        {label}
      </Text>
      <Text className="text-scoreboard-text font-heading text-[14px]">{value}</Text>
    </View>
  );
}

function BatterRow({
  name,
  onStrike = false,
  stats,
}: {
  name: string;
  onStrike?: boolean;
  stats?: { runs: number; balls: number; fours: number; sixes: number };
}) {
  const runs = stats?.runs ?? 0;
  const balls = stats?.balls ?? 0;
  const cells = [
    { v: String(runs), strong: true },
    { v: String(balls) },
    { v: String(stats?.fours ?? 0) },
    { v: String(stats?.sixes ?? 0) },
    { v: strikeRate(runs, balls), small: true },
  ];

  return (
    <View className="flex-row items-center py-2">
      {/* The name may legitimately be long — let it ellipsise. The figures
          must never shrink, so every cell is shrink-0. */}
      <Text className="text-foreground min-w-0 flex-1 text-[13.5px]" numberOfLines={1}>
        {name}
        {onStrike ? ' *' : ''}
      </Text>
      {cells.map((c, i) => (
        <Text
          key={i}
          className={`font-heading shrink-0 text-right ${COL[i]} ${
            c.strong ? 'text-foreground text-[15px]' : 'text-foreground/60'
          } ${c.small ? 'text-[12px]' : c.strong ? '' : 'text-[13px]'}`}
        >
          {c.v}
        </Text>
      ))}
    </View>
  );
}

function Key({
  label,
  tone,
  text,
  onPress,
  disabled,
}: {
  label: string;
  runs?: number;
  tone: string;
  text: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '0' ? 'Dot ball' : label === 'W' ? 'Wicket' : `${label} runs`}
      onPress={onPress}
      disabled={disabled}
      // w-1/4 with a right/bottom hairline gives the drawn grid without gaps.
      className={`${tone} border-border h-[52px] w-1/4 items-center justify-center border-b border-r ${
        disabled ? 'opacity-40' : 'active:opacity-70'
      }`}
    >
      <Text className={`${text} font-heading text-[22px]`}>{label === '0' ? '0' : label}</Text>
    </Pressable>
  );
}
