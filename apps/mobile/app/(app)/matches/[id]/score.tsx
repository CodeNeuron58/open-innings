/**
 * The ball-by-ball scorer. Server owns state, mandatory sheets block scoring,
 * and no ads are shown here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  applyBall,
  asPlayerId,
  ballMark,
  formatOvers,
  groupIntoOvers,
  type BallEventInput,
  type BallEventType,
  type MatchState,
  type PlayerId,
} from '@open-innings/scoring';
import type { BallCorrectionChange, PatchBallInput, ScorerResponse } from '@open-innings/shared';
import {
  EXTRA_LABELS,
  armedTotal,
  splitExtra,
  wicketDeliveryFor,
} from '../../../../lib/deliveries';
import { feelForBall, tap } from '../../../../lib/haptics';
import { api } from '../../../../lib/api';
import { requestIdFor } from '../../../../lib/request-id';
import { useSession } from '../../../../lib/session';
import { useSettings } from '../../../../lib/settings';
import { useApiQuery, useApiMutation } from '../../../../lib/use-api';
import { project } from '../../../../lib/outbox';
import { useOutbox, type SyncState } from '../../../../lib/use-outbox';
import { Button, ErrorBanner } from '../../../../components/ui';
import { SkeletonConsole } from '../../../../components/Skeleton';
import { BallChip } from '../../../../components/scorer/BallChip';
import { CorrectBallSheet } from '../../../../components/scorer/CorrectBall';
import { EndOfOver } from '../../../../components/scorer/EndOfOver';
import { InningsBreak } from '../../../../components/scorer/InningsBreak';
import {
  ExtraRunsSheet,
  NextPlayerSheet,
  OverthrowSheet,
  WicketSheet,
  type ExtraKind,
  type WicketEntry,
} from '../../../../components/scorer/Sheets';
import { ConsoleMenu } from '../../../../components/scorer/ConsoleMenu';

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

  // A delivery the engine refused, now that the engine runs here. See `send`.
  const [localRefusal, setLocalRefusal] = useState<string | null>(null);
  const [showWicket, setShowWicket] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showRetirement, setShowRetirement] = useState(false);
  const [showOverthrow, setShowOverthrow] = useState(false);
  const [showExtraRunsSheet, setShowExtraRunsSheet] = useState(false);
  // State for correcting a previous delivery.
  // Kept open on success to show what the correction changed.
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionChanges, setCorrectionChanges] = useState<BallCorrectionChange[] | null>(null);
  // Correcting the delivery to a dismissal: the wicket sheet takes over from
  // the correction sheet rather than opening on top of it. Nested modals are
  // unreliable on Android, and this is one question at a time either way.
  const [correctingWicket, setCorrectingWicket] = useState(false);
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

  // Keeps the newest over in view as the strip grows past the screen.
  const stripRef = useRef<ScrollView>(null);

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

  /*
   * The last thing the server said, and the deliveries it has not seen.
   *
   * The console shows `project(serverState, pending)` and nothing else. That
   * is not an optimistic guess: `packages/scoring` is a workspace dependency
   * of both this app and the API, so folding a ball here runs the server's own
   * arithmetic on the server's own last answer. See lib/outbox.ts.
   *
   * Every ball used to be a blocking POST with the whole keypad disabled for
   * the round trip, which on a ground with one bar is a console that freezes
   * after every delivery — and with no bars is not a scoring app at all.
   */
  const outbox = useOutbox({
    matchId: id,
    token,
    onSynced: (next) => applyState(next),
  });

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

  /*
   * The console's own shape, not a spinner.
   *
   * This is the screen most often opened on a ground's connection, and the one
   * where a blank screen is most alarming: a scorer who taps into a match and
   * sees nothing does not know whether the match is still there.
   */
  if (query.isLoading) return <SkeletonConsole />;

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
  const serverState = live ?? (data.state as MatchState);

  // One definition of what is on the screen. Nothing else in this file is
  // allowed to compute a score.
  const projection = project(serverState, outbox.pending);
  const state = projection.state;
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

  /**
   * Record a delivery.
   *
   * Queued, not sent. It lands on disk and on the screen immediately and the
   * drain loop deals with the network — so a tap is never waiting on a
   * signal, and six overs scored in a dead spot are six overs safely recorded.
   *
   * Returns the state the delivery produces, because callers ask questions of
   * it — `scoreWicket` needs to know whether that wicket ended the innings
   * before it names the next batter.
   */
  function send(ball: BallEventInput): MatchState | null {
    /*
     * Folded before it is queued, and the fold is allowed to refuse.
     *
     * The engine now runs on this device, which means an unlawful delivery
     * throws *here* rather than coming back as a 400. Unguarded that is a
     * crashed console mid-over — strictly worse than the round trip it
     * replaced. So the refusal is caught and shown, which is also a better
     * answer than the server's was: it arrives before the ball is queued, so
     * nothing has to be undone.
     */
    let next: MatchState;
    try {
      // Folded from `state`, this render's projection, which is the only
      // definition of where the match has got to.
      next = applyBall(state, ball);
    } catch (error) {
      setLocalRefusal(error instanceof Error ? error.message : 'That delivery cannot be recorded.');
      return null;
    }

    setLocalRefusal(null);
    const { requestId } = requestIdFor(null, JSON.stringify(ball));
    void outbox.add(ball, requestId);
    return next;
  }

  /*
   * Five runs, behind a question.
   *
   * This used to be a button called "+5 Pen" sitting in the extras row beside
   * Wide, firing on a single tap. It is one of the rarest awards in cricket and
   * it was one accidental brush from being on the board, recoverable only by
   * noticing and undoing.
   */
  function confirmPenalty() {
    Alert.alert(
      'Award 5 penalty runs?',
      'Law 41/42 — a helmet on the field, the ball tampered with, or time wasted. Five runs go to the batting side and no ball is bowled.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Award 5 runs',
          onPress: () =>
            void send({
              inningsId: inn.id,
              eventType: 'penalty',
              runsOffBat: 0,
              overthrowRuns: 0,
              extraRuns: 5,
              totalRuns: 5,
              batsmanId: effStriker,
              nonStrikerId: effNonStriker,
              bowlerId: effBowler,
              bowlerReplacedMidOver: midOverBowlerId !== null,
            }),
        },
      ],
    );
  }

  // Abandoning used to be reachable only by leaving the console, finding the
  // match in the list, and knowing to long-press it — which is a lot to
  // discover in the rain.
  function confirmAbandon() {
    Alert.alert(
      'Abandon this match?',
      'It will be recorded as a no result — not a tie, and not a win. Everything scored so far is kept.',
      [
        { text: 'Keep playing', style: 'cancel' },
        { text: 'Rain / bad weather', onPress: () => void abandon('Rain') },
        { text: 'Bad light', onPress: () => void abandon('Bad light') },
        { text: 'Mutual agreement', onPress: () => void abandon('Mutual agreement') },
      ],
    );
  }

  async function abandon(reason: string) {
    const done = await mutation.run((t) => api.abandonMatch(t, id, reason));
    if (done) router.replace({ pathname: '/matches/[id]/result', params: { id } });
  }

  /**
   * Take back the last delivery.
   *
   * A ball this device queued and the server has not seen is simply removed —
   * no network, no round trip, and while offline that is every ball, so the
   * ground-side case is covered completely. Only a delivery the server has
   * already stored needs asking, and by definition there was a signal when it
   * was recorded.
   */
  async function undo() {
    if (await outbox.undoLast()) return;

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
    setCorrectingWicket(false);
  }

  /**
   * Replace a delivery with a dismissal.
   *
   * The same `correctBall` every other correction goes through — the only
   * difference is that the payload carries the wicket fields, which
   * `patchBallSchema` has accepted all along.
   *
   * The batters are deliberately not sent. A patch treats them as optional and
   * derives them when absent, and who was at the crease is a consequence of
   * every ball before this one — so asserting it from memory is how a
   * correction puts somebody at the wrong end.
   */
  async function correctToWicket(entry: WicketEntry) {
    setCorrectingWicket(false);
    const { eventType, runsOffBat, extraRuns } = wicketDeliveryFor(entry.delivery, entry.runs);

    await correctBall({
      eventType,
      runsOffBat,
      overthrowRuns: 0,
      extraRuns,
      wicketType: entry.type,
      wicketPlayerId: entry.outBatterId,
      fielderId: entry.fielderId,
    });
  }

  function scoreRuns(runsOffBat: RunKey) {
    if (pendingExtra) {
      const extra = pendingExtra;
      setPendingExtra(null);
      // `armedTotal`, not a copy of it — the key showed this number a moment
      // ago and the two must be the same number. See lib/deliveries.ts.
      void scoreExtra(extra, armedTotal(extra, runsOffBat));
      return;
    }

    void send({
      inningsId: inn.id,
      eventType: RUN_EVENT_TYPE[runsOffBat],
      runsOffBat,
      overthrowRuns: 0,
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
    setShowExtraRunsSheet(false);
    void send({
      inningsId: inn.id,
      eventType: kind,
      runsOffBat,
      overthrowRuns: 0,
      extraRuns,
      totalRuns,
      batsmanId: effStriker,
      nonStrikerId: effNonStriker,
      bowlerId: effBowler,
      bowlerReplacedMidOver: midOverBowlerId !== null,
    });
  }

  function scoreOverthrow(runsOffBat: number, overthrowRuns: number) {
    setShowOverthrow(false);
    void send({
      inningsId: inn.id,
      eventType: RUN_EVENT_TYPE[runsOffBat as RunKey] ?? '1',
      runsOffBat,
      overthrowRuns,
      extraRuns: 0,
      totalRuns: runsOffBat + overthrowRuns,
      batsmanId: effStriker,
      nonStrikerId: effNonStriker,
      bowlerId: effBowler,
      bowlerReplacedMidOver: midOverBowlerId !== null,
    });
  }

  function scoreWicket(entry: WicketEntry) {
    const { type, outBatterId, fielderId, nextBatterId, runs, delivery } = entry;

    setShowWicket(false);
    setPendingExtra(null);

    /*
     * The delivery the dismissal happened off, carried through rather than
     * dropped.
     *
     * This used to send a flat `eventType: 'wicket'` with no extras, whatever
     * the scorer had armed. A stumping off a wide — one of the commonest
     * dismissals there is — recorded the stumping and lost the wide's penalty
     * run, silently, on a card that had already been shared. The engine has
     * validated dismissals against wides and no-balls all along; only this
     * screen threw the answer away.
     */
    const { eventType, runsOffBat, extraRuns, totalRuns } = wicketDeliveryFor(delivery, runs);

    // Through `send`, so a wicket gets the same retry protection every other
    // delivery has — it was the one path that bypassed it.
    const next = send({
      inningsId: inn.id,
      eventType,
      runsOffBat,
      overthrowRuns: 0,
      extraRuns,
      totalRuns,
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

  /*
   * Who bowled from the end the next over comes from.
   *
   * The over just finished is `currentOver - 1`; the one before it came from
   * the other end, which is the same end as the over about to start. Most
   * sides rotate five or six bowlers in a fixed pattern from two ends, so this
   * is the answer far more often than not — and the end-of-over list used to
   * be the whole side in roster order with no memory of the rotation at all.
   */
  const previousEndBowlerId =
    state.balls.find((b) => b.overNumber === currentOver - 2)?.bowlerId ?? null;

  // What "undo" is about to take off the board, in the notation the over strip
  // already uses — so the button and the chip it removes say the same thing.
  const undoTarget = lastBall ? ballMark(lastBall).label : '';

  /*
   * The two questions a scorer is asked most often, and the plate answered
   * neither.
   *
   * "How many extras?" and "what's the partnership?" are both derivable from
   * state the engine already keeps — `inn.extras` and the active partnership —
   * and both used to require leaving the console for the card. The last wicket
   * is the third: it is how a captain decides whether to send the next one in
   * ahead of the order.
   */
  const partnership = state.partnerships.find((p) => p.isActive) ?? null;
  const lastWicket = state.fallOfWickets[state.fallOfWickets.length - 1] ?? null;

  /*
   * The last few overs, oldest first.
   *
   * `groupIntoOvers` is the app's one way of cutting a ball log into overs and
   * it returns newest first — right for a commentary feed, wrong for a strip
   * you read left to right — so it is reversed here rather than reimplemented.
   *
   * Capped: a fifty-over innings is fifty groups and the scorer wants the last
   * few. Anything older is on the card, which is now one tap away.
   */
  const recentOvers = [...groupIntoOvers(state.balls, (id) => nameOf(id))]
    .slice(0, OVERS_IN_STRIP)
    .reverse();

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
          accessibilityLabel="Back"
          // `replace` here threw the stack away and dumped the scorer on the
          // global match list, so Android's hardware back became a guess.
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/matches'))}
          className="h-12 w-11 items-center justify-center"
        >
          <Text className="text-foreground/70 text-xl">‹</Text>
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text className="text-foreground font-heading text-[15px]" numberOfLines={1}>
            {data.battingTeamName} <Text className="text-foreground/60">v</Text>{' '}
            {data.bowlingTeamName}
          </Text>
          <Text
            className="font-heading text-[11px] uppercase tracking-[1.3px] text-neutral-700"
            numberOfLines={1}
          >
            {state.match.oversPerInnings} overs {' · '} {inn.inningsNumber === 1 ? '1st' : '2nd'}{' '}
            innings
          </Text>
        </View>
        {/* The scorecard, one tap away.

            It used to be unreachable from here: this screen never rendered the
            match tabs, so checking the bowling figures a captain had just
            asked for meant leaving the console, finding the match in the list,
            opening Card, and navigating all the way back. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Full scorecard"
          onPress={() => router.push({ pathname: '/matches/[id]/card', params: { id } })}
          className="border-border h-11 shrink-0 items-center justify-center border px-3 active:opacity-70"
        >
          <Text className="text-foreground font-heading text-[11px] uppercase tracking-[1.2px]">
            Card
          </Text>
        </Pressable>

        {/* Everything that is not a delivery. See ConsoleMenu. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Match options"
          onPress={() => {
            tap();
            setShowMenu(true);
          }}
          className="border-border h-11 w-11 shrink-0 items-center justify-center border active:opacity-70"
        >
          <Text className="text-foreground font-heading text-[17px] leading-[17px]">⋯</Text>
        </Pressable>
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
              <Text className="text-scoreboard-text font-heading mt-0.5 text-[11px] uppercase tracking-[1.3px] opacity-60">
                Overs
              </Text>
            </View>
            {inn.target !== undefined ? (
              <View className="ml-auto shrink-0 items-end pb-1">
                <Text className="text-scoreboard-text font-heading text-[11px] uppercase tracking-[1.3px] opacity-60">
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
                <Text className="text-scoreboard-text font-heading ml-auto shrink-0 text-[15px]">
                  Need {runsNeeded} off {ballsLeft}
                </Text>
              </>
            ) : null}
          </View>

          {/* Extras, the stand, and how the last one fell. All three are
              folded out of state the engine already holds. */}
          <View className="border-scoreboard-text/25 mt-2.5 flex-row flex-wrap gap-x-4 gap-y-1 border-t pt-2.5">
            <Plate label="Extras" value={String(inn.extras)} />
            {partnership ? (
              <Plate label="Stand" value={`${partnership.runs} (${partnership.balls})`} />
            ) : null}
            {lastWicket ? (
              <Plate
                label={`Last wkt ${lastWicket.wicketNumber}`}
                value={`${nameOf(lastWicket.batsmanOutId)} ${lastWicket.runs}-${lastWicket.wicketNumber}`}
                wide
              />
            ) : null}
          </View>

          {inn.isFreeHitNext && !completed ? (
            <View className="mt-3 flex-row items-center justify-between border border-amber-400/60 bg-amber-400/20 px-3 py-2">
              <View className="flex-row items-center gap-2">
                <View className="h-2 w-2 bg-amber-400" />
                <Text className="font-heading text-[13.5px] font-bold uppercase tracking-[1.8px] text-amber-300">
                  FREE HIT
                </Text>
              </View>
              <Text className="font-heading text-[11px] uppercase tracking-[1.2px] text-amber-200/90">
                Only Run Out & Obstruction (Law 21.18)
              </Text>
            </View>
          ) : null}
        </View>

        {/* Batters */}
        <View className="border-border border-b px-4">
          <View className="border-border flex-row border-b pb-1.5 pt-2">
            <Text className="font-heading flex-1 text-[11px] uppercase tracking-[1.3px] text-neutral-700">
              Batting
            </Text>
            {['R', 'B', '4s', '6s', 'SR'].map((h, i) => (
              <Text
                key={h}
                className={`font-heading text-right text-[11px] uppercase tracking-[1.3px] text-neutral-700 ${COL[i]}`}
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
          <Text className="font-heading shrink-0 text-[11px] uppercase tracking-[1.3px] text-neutral-700">
            Bowling
          </Text>
          <Text className="text-foreground min-w-0 flex-1 text-[16px]" numberOfLines={1}>
            {nameOf(effBowler)}
            {midOverBowlerId ? (
              <Text className="text-steel-700 font-heading text-[11px]">
                {' '}
                · replacing (Law 17.4)
              </Text>
            ) : null}
          </Text>
          {overInProgress && !completed && !midOverBowlerId ? (
            <View className="border-steel-400 bg-steel-100 border px-1.5 py-0.5">
              <Text className="text-steel-800 font-heading text-[11px] uppercase tracking-[1px]">
                Change
              </Text>
            </View>
          ) : null}
          <Text className="text-foreground font-heading shrink-0 text-[13.5px]">
            {formatOvers(bowlerStats?.balls ?? 0)}–{bowlerStats?.maidens ?? 0}–
            {bowlerStats?.runs ?? 0}–{bowlerStats?.wickets ?? 0}
          </Text>
          <Text className="text-foreground/60 font-heading shrink-0 text-[13.5px]">
            {rate(bowlerStats?.runs ?? 0, bowlerStats?.balls ?? 0)}
          </Text>
        </Pressable>

        {/*
          The innings, not just the over.

          This showed six chips and nothing else, so a mistake noticed three
          overs later could not be reached from the console at all — the
          correction handler was only ever wired to the current over. The
          server has always been able to replay from any delivery; only the UI
          could not address one.

          Scrolled horizontally with the current over on the right, because
          that is where the next ball is about to land and it is what the
          scorer is looking at.
        */}
        <View className="pb-3.5 pt-3">
          <View className="mb-2 flex-row items-baseline px-4">
            <Text className="text-steel-700 font-heading shrink-0 text-[11px] uppercase tracking-[1.3px]">
              {overLabel}
            </Text>
            <Text className="text-foreground/70 font-heading ml-auto shrink-0 text-[13.5px]">
              {runsThisOver} run{runsThisOver === 1 ? '' : 's'} this over
            </Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="px-4 gap-3 items-start"
            // Pinned to the newest over. `groupIntoOvers` returns newest
            // first, so the strip is reversed and this keeps the far end in
            // view as the over fills.
            ref={stripRef}
            onContentSizeChange={() => stripRef.current?.scrollToEnd({ animated: false })}
          >
            {recentOvers.map((over) => (
              <View key={over.overNumber} className="shrink-0">
                <Text
                  className="font-heading mb-1.5 text-[11px] uppercase tracking-[1.2px] text-neutral-700"
                  numberOfLines={1}
                >
                  Ov {over.overNumber} · {over.bowlerName}
                </Text>
                <View className="flex-row gap-1.5">
                  {over.balls.map((b, i) => (
                    <BallChip
                      key={`${b.ballNumber}-${i}`}
                      ball={b}
                      // The one that just landed, so a mis-tap is visible
                      // straight away rather than at the end of the over.
                      latest={lastBall !== undefined && String(b.id) === String(lastBall.id)}
                      // Only while the innings is live. Correcting a delivery
                      // in a closed innings would have to reopen a finished
                      // match and invalidate a result already shared, which is
                      // a different feature and is refused by the server too.
                      onPress={completed ? undefined : () => setCorrecting(String(b.id))}
                    />
                  ))}
                  {/* The balls not yet bowled, on the over in progress only —
                      drawn, not filled. */}
                  {over.overNumber === currentOver + 1
                    ? Array.from({ length: Math.max(0, 6 - legalThisOver) }).map((_, i) => (
                        <View
                          key={`empty-${i}`}
                          className="border-border/40 h-11 w-11 border border-dashed"
                        />
                      ))
                    : null}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        {mutation.error ? (
          <View className="px-4 pb-2">
            <ErrorBanner message={mutation.error} />
          </View>
        ) : null}

        {/* Refused before it was queued, so there is nothing to undo — just
            something to do differently. */}
        {localRefusal ? (
          <Pressable onPress={() => setLocalRefusal(null)} className="px-4 pb-2">
            <ErrorBanner message={localRefusal} />
          </Pressable>
        ) : null}

        {/* Not an error — the server was ahead of the screen, and now is not. */}
        {conflictNote ? (
          <Pressable onPress={() => setConflictNote(null)} className="px-4 pb-2">
            <View className="border-steel-300 bg-steel-100 border p-2.5">
              <Text className="text-steel-900 text-[13.5px]">{conflictNote}</Text>
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
            {/*
              The action that carries on, first.

              These were stacked Refresh / See the result / Back to matches, in
              that order, which leads with a developer's escape hatch and buries
              the only thing a scorer wants. Refresh is still here — this screen
              can genuinely be looking at state the server has moved past — but
              it is the last resort it always was, not the headline.
            */}
            <View className="mt-4 gap-2">
              <Button
                label="See the result"
                onPress={() => router.push({ pathname: '/matches/[id]/result', params: { id } })}
              />
              <Button
                label="Back to matches"
                variant="secondary"
                onPress={() => router.replace('/matches')}
              />
              <Button
                label="Reload from the server"
                variant="ghost"
                onPress={() => void reload()}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* What has and has not reached the server, next to the thumb that is
          about to add to it. This replaces a static "Live" square that meant
          nothing and said so even after an hour of nobody scoring. */}
      <SyncBar sync={outbox.sync} onRetry={outbox.retry} onDiscard={() => void outbox.discard()} />

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
                  onPress={() => {
                    tap();
                    setPendingExtra((prev) => (prev === kind ? null : kind));
                  }}
                  onLongPress={() => {
                    tap();
                    setPendingExtra(kind);
                    setShowExtraRunsSheet(true);
                  }}
                  disabled={mutation.busy}
                  className={`h-12 flex-1 items-center justify-center border ${
                    pendingExtra === kind
                      ? 'bg-primary border-primary'
                      : 'border-border bg-transparent'
                  } ${mutation.busy ? 'opacity-40' : 'active:opacity-70'}`}
                >
                  <Text
                    className={`font-heading text-[13.5px] ${
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
                  // With an extra armed, the key says what it will put on the
                  // board. A scorer should not have to remember that Wide + 4
                  // is four and No ball + 4 is five.
                  sublabel={
                    pendingExtra && k.runs !== undefined
                      ? `${armedTotal(pendingExtra, k.runs)} ${EXTRA_MARK[pendingExtra]}`
                      : undefined
                  }
                  onPress={() => (k.runs === undefined ? setShowWicket(true) : scoreRuns(k.runs))}
                  disabled={mutation.busy}
                />
              ))}
            </View>

            <View className="mt-2 flex-row items-center gap-2">
              {/* Undo names what it will remove.
                  It is the most-used correction in cricket scoring and it was
                  a 36pt outline in the corner reading "Undo" — a gamble rather
                  than a decision, because nothing said which ball was about to
                  go. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  lastBall ? `Undo the last ball — ${undoTarget}` : 'Undo — nothing to undo yet'
                }
                onPress={() => {
                  tap('undo');
                  void undo();
                }}
                disabled={mutation.busy || state.balls.length === 0}
                className={`border-input h-12 flex-row items-center justify-center border bg-neutral-200 px-4 ${
                  mutation.busy || state.balls.length === 0 ? 'opacity-40' : 'active:opacity-70'
                }`}
              >
                <Text className="text-foreground font-heading text-[15px]">
                  ↩ Undo{lastBall ? ` ${undoTarget}` : ''}
                </Text>
              </Pressable>

              {pendingExtra ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${EXTRA_LABELS[pendingExtra]} armed. Tap the runs, or tap here to enter a total.`}
                  onPress={() => setShowExtraRunsSheet(true)}
                  className="border-primary bg-primary/10 ml-auto h-12 min-w-0 flex-1 justify-center border px-3 active:opacity-70"
                >
                  <Text className="text-steel-800 font-heading text-[13.5px]" numberOfLines={2}>
                    {ARMED_HINT[pendingExtra]}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {/* Sheets */}
      {correctingBall && !correctingWicket ? (
        <CorrectBallSheet
          ball={correctingBall}
          position={positionOf(state, correcting!)}
          busy={correctionBusy}
          error={correctionError}
          changes={correctionChanges}
          onCorrect={(patch) => void correctBall(patch)}
          onCorrectToWicket={() => setCorrectingWicket(true)}
          onDismiss={closeCorrection}
        />
      ) : null}

      {/* The wicket sheet, pointed at a delivery already in the log. The
          batters are the pair who were actually at the crease for *that* ball,
          not whoever is there now. */}
      {correctingBall && correctingWicket ? (
        <WicketSheet
          strikerId={String(correctingBall.batsmanId)}
          strikerName={nameOf(correctingBall.batsmanId)}
          nonStrikerId={String(correctingBall.nonStrikerId)}
          nonStrikerName={nameOf(correctingBall.nonStrikerId)}
          fielders={data.bowlingSquad}
          nextBatters={[]}
          showNextBatter={false}
          isFreeHit={correctingBall.isFreeHit}
          confirmLabel={`Correct ball ${positionOf(state, correcting!)}`}
          onConfirm={(entry) => void correctToWicket(entry)}
          onCancel={() => setCorrectingWicket(false)}
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
          // Only the innings' own free-hit state now — a no-ball chosen inside
          // the sheet narrows it there, through the same rule sets.
          isFreeHit={inn.isFreeHitNext}
          // Whatever was armed on the keypad opens the sheet already set to it.
          initialDelivery={pendingExtra ?? 'fair'}
          onConfirm={(entry) => void scoreWicket(entry)}
          onCancel={() => setShowWicket(false)}
        />
      ) : null}

      {showMenu ? (
        <ConsoleMenu
          overInProgress={overInProgress && !completed}
          canAbandon={data.matchStatus === 'live'}
          onScorecard={() => {
            setShowMenu(false);
            router.push({ pathname: '/matches/[id]/card', params: { id } });
          }}
          onReplaceBowler={() => {
            setShowMenu(false);
            setPickingMidOverBowler(true);
          }}
          onRetire={() => {
            setShowMenu(false);
            setShowRetirement(true);
          }}
          onOverthrow={() => {
            setShowMenu(false);
            setShowOverthrow(true);
          }}
          onPenalty={() => {
            setShowMenu(false);
            confirmPenalty();
          }}
          onAbandon={() => {
            setShowMenu(false);
            confirmAbandon();
          }}
          onDismiss={() => setShowMenu(false)}
        />
      ) : null}

      {/* The same sheet as a dismissal, pointed at the three outcomes that are
          not one. It shares the machinery because the engine does. */}
      {showRetirement ? (
        <WicketSheet
          mode="retirement"
          strikerId={String(effStriker)}
          strikerName={nameOf(effStriker)}
          nonStrikerId={String(effNonStriker)}
          nonStrikerName={nameOf(effNonStriker)}
          fielders={data.bowlingSquad}
          nextBatters={batterCandidates}
          onConfirm={(entry) => {
            setShowRetirement(false);
            void scoreWicket(entry);
          }}
          onCancel={() => setShowRetirement(false)}
        />
      ) : null}

      {showOverthrow ? (
        <OverthrowSheet
          onConfirm={(runsOffBat, overthrowRuns) => scoreOverthrow(runsOffBat, overthrowRuns)}
          onCancel={() => setShowOverthrow(false)}
        />
      ) : null}

      {showExtraRunsSheet && pendingExtra ? (
        <ExtraRunsSheet
          kind={pendingExtra}
          onConfirm={(runs) => scoreExtra(pendingExtra, runs)}
          onCancel={() => {
            setShowExtraRunsSheet(false);
            setPendingExtra(null);
          }}
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
          // Ends alternate, so whoever bowled two overs ago was at the end the
          // next over comes from. In an ordinary rotation that is who bowls it.
          previousBowlerId={previousEndBowlerId}
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

/**
 * The state of the queue, in a sentence.
 *
 * Silent when there is nothing outstanding, which is most of the time — a
 * permanent "Saved" badge is noise, and the thing worth interrupting a scorer
 * for is the opposite.
 *
 * The wording matters more than usual here. Somebody who has just scored six
 * overs in a dead spot needs to know their afternoon is not at risk, and
 * "waiting" plus "safe on this phone" is the difference between carrying on
 * and starting a paper scorebook.
 */
function SyncBar({
  sync,
  onRetry,
  onDiscard,
}: {
  sync: SyncState;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  if (sync.kind === 'synced') return null;

  if (sync.kind === 'blocked') {
    return (
      <View className="border-destructive bg-destructive/10 mx-3 mb-2 border p-3">
        <Text className="text-destructive font-heading text-[13.5px]">
          {sync.count} {sync.count === 1 ? 'ball' : 'balls'} could not be saved
        </Text>
        <Text className="text-foreground/75 mt-1 text-[13.5px] leading-[17px]">{sync.message}</Text>
        <View className="mt-2.5 flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            className="border-input h-11 justify-center border px-3 active:opacity-70"
          >
            <Text className="text-foreground font-heading text-[13.5px]">Try again</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Discard the balls that could not be saved"
            onPress={onDiscard}
            className="border-input h-11 justify-center border px-3 active:opacity-70"
          >
            <Text className="text-destructive font-heading text-[13.5px]">Discard them</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const waiting = sync.kind === 'waiting';
  return (
    <View
      accessibilityRole="alert"
      className={`mx-3 mb-2 flex-row items-center gap-2 border px-3 py-2 ${
        waiting ? 'border-steel-400 bg-steel-100' : 'border-border bg-neutral-100'
      }`}
    >
      <View className={`h-2 w-2 shrink-0 ${waiting ? 'bg-steel-600' : 'bg-primary'}`} />
      <Text className="text-foreground/80 min-w-0 flex-1 text-[13.5px]" numberOfLines={2}>
        {waiting
          ? `${sync.count} ${sync.count === 1 ? 'ball' : 'balls'} waiting for a signal — safe on this phone, and sent the moment there is one.`
          : `Saving ${sync.count}…`}
      </Text>
    </View>
  );
}

/** How each extra is marked, short enough to sit under a key. */
const EXTRA_MARK: Record<ExtraKind, string> = {
  wide: 'wd',
  no_ball: 'nb',
  bye: 'b',
  leg_bye: 'lb',
};

/**
 * What the armed extra means, in the one place a scorer will read it.
 *
 * "Wide armed" said which mode was on and nothing about what the keys would
 * now do — which is the half that is not obvious, and the half that differs
 * between the two kinds of extra.
 */
const ARMED_HINT: Record<ExtraKind, string> = {
  wide: 'Wide — tap the runs they ran, or 0 for a plain wide',
  no_ball: 'No ball — tap the runs off the bat, the penalty is added',
  bye: 'Byes — tap how many they ran',
  leg_bye: 'Leg byes — tap how many they ran',
};

/**
 * How far back the over strip reaches.
 *
 * Enough to cover the spell a scorer is likely to be correcting — a mistake is
 * usually noticed within an over or two — without turning the console into the
 * scorecard, which is one tap away and is the right place for the whole
 * innings.
 */
const OVERS_IN_STRIP = 8;

/**
 * Column widths for the batting table.
 *
 * Widened with the type. The figures must never wrap or shrink — a strike rate
 * that ellipsises is worse than no strike rate — so every cell is fixed and the
 * name takes what is left.
 */
const COL = ['w-[38px]', 'w-[32px]', 'w-[28px]', 'w-[32px]', 'w-[46px]'] as const;

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

/**
 * A labelled fact on the score plate.
 *
 * Distinct from `Rate` because these are not rates: a stand of 42 off 31 and a
 * name do not want the tabular treatment a run rate does, and one of them is
 * long enough to need the whole row.
 */
function Plate({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <View className={`flex-row items-baseline gap-1.5 ${wide ? 'min-w-0 flex-1' : 'shrink-0'}`}>
      <Text className="text-scoreboard-text font-heading text-[11px] uppercase tracking-[1.3px] opacity-60">
        {label}
      </Text>
      <Text className="text-scoreboard-text font-heading min-w-0 text-[13.5px]" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Rate({ label, value }: { label: string; value: string }) {
  return (
    <View className="shrink-0 flex-row items-baseline gap-1">
      <Text className="text-scoreboard-text font-heading text-[11px] uppercase tracking-[1.3px] opacity-60">
        {label}
      </Text>
      <Text className="text-scoreboard-text font-heading text-[15px]">{value}</Text>
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
      <Text className="text-foreground min-w-0 flex-1 text-[16px]" numberOfLines={1}>
        {name}
        {onStrike ? ' *' : ''}
      </Text>
      {cells.map((c, i) => (
        <Text
          key={i}
          className={`font-heading shrink-0 text-right ${COL[i]} ${
            c.strong ? 'text-foreground text-[18px]' : 'text-foreground/75'
          } ${c.small ? 'text-[13.5px]' : c.strong ? '' : 'text-[14.5px]'}`}
        >
          {c.v}
        </Text>
      ))}
    </View>
  );
}

function Key({
  label,
  sublabel,
  runs,
  tone,
  text,
  onPress,
  disabled,
}: {
  label: string;
  /** What this key will score, when an extra is armed. */
  sublabel?: string;
  /** Undefined on the wicket key — which is how the feel is chosen. */
  runs?: number;
  tone: string;
  text: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        sublabel
          ? `${label} — scores ${sublabel}`
          : label === '0'
            ? 'Dot ball'
            : label === 'W'
              ? 'Wicket'
              : `${label} runs`
      }
      onPress={() => {
        // A wicket should not feel like a dot ball. Every one of these used to
        // buzz identically, which told a scorer watching the cricket that
        // *something* landed and nothing about what.
        tap(runs === undefined ? 'wicket' : feelForBall(runs, false));
        onPress();
      }}
      disabled={disabled}
      // w-1/4 with a right/bottom hairline gives the drawn grid without gaps.
      className={`${tone} border-border h-[58px] w-1/4 items-center justify-center border-b border-r ${
        disabled ? 'opacity-40' : 'active:opacity-70'
      }`}
    >
      <Text className={`${text} font-heading text-[22px] leading-[24px]`}>
        {label === '0' ? '0' : label}
      </Text>
      {sublabel ? (
        <Text className={`${text} font-heading text-[11px] opacity-75`}>{sublabel}</Text>
      ) : null}
    </Pressable>
  );
}
