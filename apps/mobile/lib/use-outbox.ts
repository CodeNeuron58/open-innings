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
  | { kind: 'sending'; count: number }
  /** The server could not be reached. Everything is safe on disk. */
  | { kind: 'waiting'; count: number }
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
   * Drop the delivery this device queued most recently.
   *
   * Returns false when there was nothing pending, which means the ball being
   * undone is one the server already has — a different operation, and one that
   * needs the network.
   */
  undoLast: () => Promise<boolean>;
  /** Give up on a queue that cannot be sent. */
  discard: () => Promise<void>;
  /** Try the queue again after a refusal has been dealt with. */
  retry: () => void;
};

export function useOutbox({
  matchId,
  token,
  onSynced,
}: {
  matchId: string;
  token: string | null;
  /** The server's reply to a drained delivery — the new base state. */
  onSynced: (state: MatchState) => void;
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

  const commit = useCallback((next: PendingBall[]) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadOutbox(matchId);
      if (cancelled) return;
      pendingRef.current = stored;
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

          /*
           * A 409 is the server saying it already has this ball — which is the
           * idempotency contract working, not a failure. Treat it as sent and
           * carry on down the queue.
           */
          if (status === 409) {
            await removeBall(next.requestId);
            commit(ack(pendingRef.current, next.requestId));
            continue;
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
        seq: nextSeq(pendingRef.current),
        requestId,
        ball,
        queuedAt: Date.now(),
      };

      // On disk first. A delivery the scorer has been shown as recorded must
      // survive the app dying between this line and the next.
      await saveBall(matchId, item);

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

  const retry = useCallback(() => setBlocked(null), []);

  const sync: SyncState =
    blocked !== null
      ? { kind: 'blocked', count: pending.length, message: blocked }
      : pending.length === 0
        ? { kind: 'synced' }
        : waiting
          ? { kind: 'waiting', count: pending.length }
          : { kind: 'sending', count: pending.length };

  return { pending, sync, ready, add, undoLast, discard, retry, sentIds };
}
