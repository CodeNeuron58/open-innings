/**
 * The queue, the drain loop, and what the console is told about both.
 *
 * `outbox.ts` decides what is true; `outbox-db.ts` remembers it; this puts the
 * two on a timer and points them at the network.
 *
 * ## The loop
 *
 * Strictly one delivery at a time, in `seq` order, never in parallel. A ball
 * log replayed out of order is a different match, and the server applies what
 * it is sent in the order it arrives — so concurrency here would not be a
 * speed-up, it would be a corruption.
 *
 * On success the server's own reply becomes the new base state and the
 * delivery leaves the queue. The projection is unchanged across that swap by
 * construction, so nothing on screen moves — see the test that asserts it.
 *
 * ## Failure
 *
 * A network failure keeps the delivery and tries again later: the request may
 * have been recorded or may never have arrived, and nobody knows which. The
 * `requestId` is what makes that safe — the server recognises a resend and
 * replies with the answer it already gave, rather than recording a second
 * ball. That is what migration 0013 is for.
 *
 * A refusal is an answer, and resending cannot change an answer. The queue
 * stops and says so, because a queue that retries forever never drains and the
 * scorer is told "3 balls waiting" for the rest of the afternoon.
 *
 * ## No connectivity library
 *
 * There is no NetInfo here on purpose. "Am I online" is a question whose only
 * honest answer is the outcome of a request, and asking the OS instead adds a
 * native dependency to get a worse answer — a phone on a ground's wifi with no
 * route out reports itself connected. The loop simply tries, and a failure to
 * reach the server *is* the offline signal.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BallEventInput, MatchState } from '@open-innings/scoring';
import { ApiError, NetworkError, api } from './api';
import { ack, dropLast, enqueue, head, isRetryable, nextSeq, type PendingBall } from './outbox';
import { clearOutbox, loadOutbox, removeBall, saveBall } from './outbox-db';

/** How long to wait before trying a stalled queue again. */
const RETRY_MS = 4000;

export type SyncState =
  | { kind: 'synced' }
  /** In flight, or about to be. */
  | { kind: 'sending'; count: number; memoryOnly?: boolean }
  /** The server could not be reached. Everything is safe on disk. */
  | { kind: 'waiting'; count: number; memoryOnly?: boolean }
  /** The server refused a delivery. Nothing after it can be sent. */
  | { kind: 'blocked'; count: number; message: string };

export type Outbox = {
  pending: PendingBall[];
  sync: SyncState;
  /** False until the queue has been read back from disk. */
  ready: boolean;
  /** Queue a delivery. Returns immediately — the network is not waited on. */
  add: (ball: BallEventInput, requestId: string) => Promise<void>;
  /**
   * Every request id this device has minted for this match.
   *
   * Kept so the console can tell whether the server's newest delivery came
   * from here or from somewhere else. It is the only signal available without
   * a new column — a ball carries the id its device made for it (migration
   * 0013) — and "somewhere else" means another phone signed in to the same
   * account, which is the case worth warning about because the two will
   * overwrite each other.
   *
   * In memory only, and per mount. A restart forgets, which errs the safe way:
   * the console says "somebody else is scoring" when it is not certain, rather
   * than staying quiet when it should not.
   */
  sentIds: ReadonlySet<string>;
  /**
   * Fold request ids the server's ball log already holds into `sentIds`.
   *
   * The console seeds this from the scorer response on load, so its own last
   * ball — and every ball already on the card — stops reading as foreign on
   * re-entry. No-op when nothing is new, so a refetch does not re-render.
   */
  addSentIds: (ids: readonly string[]) => void;
  /**
   * Drop the delivery this device queued most recently.
   *
   * Returns false when there was nothing pending, which means the ball being
   * undone is one the server already has — a different operation, and one that
   * needs the network.
   */
  undoLast: () => Promise<boolean>;
  /** Give up on a queue that cannot be sent. */
  discard: () => Promise<void>;
  /**
   * Drop one queued delivery by its request id.
   *
   * The per-ball half of a refusal: when the head delivery is refused, the
   * balls behind it are usually still good, and "discard the queue" threw
   * them away with it. Also how the console removes a delivery the local
   * engine could no longer fold.
   */
  discardOne: (requestId: string) => Promise<void>;
  /** Try the queue again after a refusal has been dealt with. */
  retry: () => void;
};

export function useOutbox({
  matchId,
  token,
  onSynced,
  onStale,
}: {
  matchId: string;
  token: string | null;
  /** The server's reply to a drained delivery — the new base state. */
  onSynced: (state: MatchState) => void;
  /**
   * The server said the innings moved under the queue. The console pulls the
   * innings as it now stands, so the display folds against server truth again
   * before the delivery is retried. The retry itself is judged by the server,
   * which re-validates against the real innings either way.
   */
  onStale: () => Promise<void>;
}): Outbox {
  const [pending, setPending] = useState<PendingBall[]>([]);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  // Held rather than depended on: the callback is a fresh closure on every
  // render of the console, and depending on it would restart the loop each
  // time the score changed.
  const onSyncedRef = useRef(onSynced);
  useEffect(() => {
    onSyncedRef.current = onSynced;
  });

  const onStaleRef = useRef(onStale);
  useEffect(() => {
    onStaleRef.current = onStale;
  });

  /*
   * Deliveries that have already had their one stale-retry.
   *
   * A `STALE_INNINGS` refusal means the innings moved while the queue held
   * this ball — and the ball may be perfectly lawful against the innings as
   * it now stands. The server is the referee, so the delivery gets one
   * reload-and-resend; recording that here is what turns "resend after
   * reload" from a potential infinite loop into a bounded retry. Twice stale
   * is an answer, and the queue stops and shows it.
   */
  const staleRetried = useRef<Set<string>>(new Set());

  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  });

  // One drain at a time, whatever asks for one.
  const draining = useRef(false);

  /*
   * The queue itself lives in the ref; `pending` is its shadow, for rendering.
   *
   * The loop must work from the live queue rather than the queue as it was
   * when the loop started — an await inside it can span several taps. Writing
   * the ref during render would be the easy way to keep it fresh and is unsound
   * in a concurrent render, so every mutation goes through `commit` instead and
   * the two move together.
   */
  /*
   * Request ids minted here — see `sentIds`.
   *
   * State rather than a ref, because the console reads it while rendering to
   * decide whether the server's newest delivery was its own. A ref read during
   * render is unsound in a concurrent render and the compiler says so; the
   * cost of state is one extra render per delivery, on a screen that
   * re-renders per delivery anyway.
   */
  const [sentIds, setSentIds] = useState<ReadonlySet<string>>(() => new Set());
  const pendingRef = useRef<PendingBall[]>([]);
  /*
   * The highest sequence number handed out.
   *
   * `nextSeq` reads the queue, and the queue only advances in `commit` — which
   * runs after the disk write. Two taps inside that window both read the same
   * queue and minted the same seq: harmless to the on-screen order (the fold
   * sorts stably) but unspecified on reload, where `loadOutbox` orders by seq.
   * Minting here, synchronously, cannot interleave — JavaScript is
   * single-threaded up to the first await.
   */
  const seqRef = useRef(0);
  /*
   * Whether the disk has accepted everything handed to it. One SQLite failure
   * downgrades the queue to memory-only, and the sync bar has to stop saying
   * "safe on this phone" the moment that happens.
   */
  const [memoryOnly, setMemoryOnly] = useState(false);

  const commit = useCallback((next: PendingBall[]) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  /**
   * Fold request ids the server already holds into the sent set.
   *
   * The console warns when the server's newest delivery carries an id this
   * device never minted — but on re-entry the device has minted none of them,
   * and its own last ball looked foreign. The scorer seeds this from the
   * scorer response's `knownRequestIds`. Settling to the same set when nothing
   * is new keeps a refetch from re-rendering the screen.
   */
  const addSentIds = useCallback((ids: readonly string[]) => {
    setSentIds((prev) => {
      const additions = ids.filter((id) => !prev.has(id));
      if (additions.length === 0) return prev;
      const next = new Set(prev);
      for (const id of additions) next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadOutbox(matchId);
      if (cancelled) return;
      pendingRef.current = stored;
      // Continue the sequence above whatever a previous mount queued, so a
      // reload cannot mint a seq that collides with a row already on disk.
      seqRef.current = stored.reduce((max, p) => Math.max(max, p.seq), 0);
      setPending(stored);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;

    try {
      for (;;) {
        const authToken = tokenRef.current;
        const next = head(pendingRef.current);
        if (!next || !authToken) return;

        try {
          const state = await api.postBall(authToken, matchId, next.ball, next.requestId);

          await removeBall(next.requestId);
          commit(ack(pendingRef.current, next.requestId));
          staleRetried.current.delete(next.requestId);
          setWaiting(false);
          setBlocked(null);
          onSyncedRef.current(state);
        } catch (error) {
          const status =
            error instanceof ApiError ? error.status : error instanceof NetworkError ? null : 0;

          if (isRetryable(status)) {
            // Nothing is known about this delivery. It stays queued, and the
            // same requestId makes the resend safe.
            setWaiting(true);
            return;
          }

          if (status === 409) {
            const code = error instanceof ApiError ? error.code : undefined;

            /*
             * "Already recorded" is the idempotency contract working, not a
             * failure. Treat it as sent and carry on down the queue.
             */
            if (code === 'DUPLICATE_BALL' || code === 'DUPLICATE_REQUEST') {
              await removeBall(next.requestId);
              commit(ack(pendingRef.current, next.requestId));
              continue;
            }

            /*
             * "The innings changed while you were scoring" is a different
             * sentence. The ball may be perfectly valid against the innings
             * as it now stands — another device's correction replayed it, most
             * plausibly — so acking here was silently deleting a good ball.
             * Reload the innings, resend, and let the server judge it against
             * the truth. Once per delivery: stale twice is a refusal.
             */
            if (code === 'STALE_INNINGS' && !staleRetried.current.has(next.requestId)) {
              staleRetried.current.add(next.requestId);
              setWaiting(true);
              await onStaleRef.current();
              continue;
            }

            /*
             * Everything else — the innings ended under the queue, or a ball
             * that went stale twice. An answer, and resending cannot change
             * an answer. The queue stops and says so; the deliveries behind
             * the refused one are usually still good, and the sync bar's
             * per-ball discard is how they get their turn.
             */
            setBlocked(
              error instanceof Error ? error.message : 'The server would not accept this delivery.',
            );
            return;
          }

          setBlocked(
            error instanceof Error ? error.message : 'The server would not accept this delivery.',
          );
          return;
        }
      }
    } finally {
      draining.current = false;
    }
  }, [matchId, commit]);

  // Drain whenever there is something to send, and keep retrying while the
  // server is out of reach.
  useEffect(() => {
    if (!ready || blocked !== null || pending.length === 0 || !token) return;

    void drain();
    const timer = setInterval(() => void drain(), RETRY_MS);
    return () => clearInterval(timer);
  }, [ready, blocked, pending.length, token, drain]);

  const add = useCallback(
    async (ball: BallEventInput, requestId: string) => {
      // A new Set, not a mutation: React compares by identity.
      setSentIds((prev) => new Set(prev).add(requestId));
      const item: PendingBall = {
        seq: (seqRef.current = Math.max(nextSeq(pendingRef.current), seqRef.current + 1)),
        requestId,
        ball,
        queuedAt: Date.now(),
      };

      // On disk first. A delivery the scorer has been shown as recorded must
      // survive the app dying between this line and the next — and when the
      // disk refuses, the sync bar has to stop claiming it is safe.
      if (!(await saveBall(matchId, item))) setMemoryOnly(true);

      commit(enqueue(pendingRef.current, item));
    },
    [matchId, commit],
  );

  const undoLast = useCallback(async () => {
    const { pending: rest, removed } = dropLast(pendingRef.current);
    if (!removed) return false;

    await removeBall(removed.requestId);
    commit(rest);
    // Undoing the delivery a refusal was about clears the refusal.
    setBlocked(null);
    return true;
  }, [commit]);

  const discard = useCallback(async () => {
    await clearOutbox(matchId);
    commit([]);
    setBlocked(null);
    setWaiting(false);
  }, [matchId, commit]);

  const discardOne = useCallback(
    async (requestId: string) => {
      await removeBall(requestId);
      commit(ack(pendingRef.current, requestId));
      // If this was the delivery the refusal was about, the queue behind it
      // is free to move; if it was not, retrying is still what the scorer
      // asked for by keeping the app open.
      setBlocked(null);
    },
    [commit],
  );

  const retry = useCallback(() => setBlocked(null), []);

  const sync: SyncState =
    blocked !== null
      ? { kind: 'blocked', count: pending.length, message: blocked }
      : pending.length === 0
        ? { kind: 'synced' }
        : waiting
          ? { kind: 'waiting', count: pending.length, ...(memoryOnly ? { memoryOnly: true } : {}) }
          : { kind: 'sending', count: pending.length, ...(memoryOnly ? { memoryOnly: true } : {}) };

  return { pending, sync, ready, add, undoLast, discard, discardOne, retry, sentIds, addSentIds };
}
