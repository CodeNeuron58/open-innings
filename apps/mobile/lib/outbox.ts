/**
 * The deliveries this device has recorded and the server has not confirmed.
 *
 * ## Why the scorer needs one
 *
 * Every ball used to be a blocking `POST`, and `disabled={mutation.busy}` took
 * the whole keypad down for the length of the round trip. On a ground with one
 * bar that is a console that freezes after every delivery and silently drops
 * anything tapped into the gap. With no bars at all it is not a scoring app.
 *
 * Cricket is played on grounds without signal. That is not an edge case for
 * this product, it is most Saturdays.
 *
 * ## Why this is safe
 *
 * The engine is a pure function of `(state, ball)`, and it is the *same*
 * function on both sides — `packages/scoring` is a workspace dependency of the
 * app and the API. So the display state is defined as:
 *
 *     display = pending.reduce(applyBall, serverState)
 *
 * There is no optimistic guess anywhere in that. The device is not predicting
 * what the server will say; it is running the server's own arithmetic on the
 * server's own last answer. When a delivery is acknowledged it moves out of
 * `pending` and `serverState` advances, and the projection is unchanged
 * because it was already exactly that.
 *
 * ## Undo
 *
 * Deliberately **not** queued as an operation. Undo drops the last *pending*
 * delivery, which never reaches the server at all — and while offline every
 * delivery is pending, so the ground-side case is fully covered. Undoing a
 * ball the server has already stored is a different thing and needs the
 * network, which is fine, because by definition you had the network when you
 * recorded it.
 *
 * Queuing undo as an op would mean projecting it, and projection cannot undo:
 * a folded `MatchState` cannot be unfolded without the seed the server holds.
 * `replayWithLastRemoved` needs that seed, which is precisely why it lives on
 * the server side.
 */
import {
  applyBall,
  ScoringError,
  type BallEventInput,
  type MatchState,
} from '@open-innings/scoring';

/** A delivery recorded on this device and not yet acknowledged. */
export type PendingBall = {
  /**
   * Monotonic per match. Ordering is the whole contract — a ball log replayed
   * out of order is a different match — so the queue is drained by `seq` and
   * never in parallel.
   */
  seq: number;
  /**
   * The idempotency key the server matches on. Minted from the delivery's own
   * signature by `requestIdFor`, so a resend is recognised and a genuinely new
   * delivery is not. See migration 0013.
   */
  requestId: string;
  ball: BallEventInput;
  /** For "3 balls waiting since 14:32" rather than "3 balls waiting". */
  queuedAt: number;
};

/** A queued delivery the engine will not accept against current state. */
export type RejectedBall = {
  pending: PendingBall;
  code: string;
  message: string;
};

export type Projection = {
  /** Server truth with every accepted pending delivery folded onto it. */
  state: MatchState;
  /**
   * Deliveries that did not survive the fold.
   *
   * Normally empty. It fills when the server state moved underneath the queue
   * — another device scored the same match, or a correction replayed the
   * innings — and the queued delivery no longer describes something that can
   * happen. Reported rather than thrown, because a scorer holding six unsynced
   * balls must not be shown a crash: five of them are probably still good.
   */
  rejected: RejectedBall[];
};

/**
 * Fold the queue onto the last known server state.
 *
 * Pure, and the only definition of what the console shows. Nothing else in the
 * app is allowed to compute a display state, or there would be two answers to
 * "what is the score" and one of them would be wrong.
 *
 * A rejected delivery is skipped and the fold continues, because the deliveries
 * after it are independently valid far more often than not — a wicket refused
 * because another device already recorded it does not invalidate the four dot
 * balls behind it.
 */
export function project(serverState: MatchState, pending: readonly PendingBall[]): Projection {
  const rejected: RejectedBall[] = [];
  let state = serverState;

  for (const item of [...pending].sort((a, b) => a.seq - b.seq)) {
    try {
      state = applyBall(state, item.ball);
    } catch (error) {
      rejected.push({
        pending: item,
        code: error instanceof ScoringError ? error.code : 'UNKNOWN',
        message:
          error instanceof Error ? error.message : 'This delivery could no longer be applied.',
      });
    }
  }

  return { state, rejected };
}

/** The next sequence number for a queue. */
export function nextSeq(pending: readonly PendingBall[]): number {
  return pending.reduce((max, p) => Math.max(max, p.seq), 0) + 1;
}

/**
 * Add a delivery to the end of the queue.
 *
 * Rejects a duplicate `requestId` rather than appending it. That is the same
 * guarantee the server's idempotency gives, applied one layer earlier: a
 * double-tap that composes a byte-identical delivery mints the same id, and
 * two of them in the queue would be two balls on the board.
 */
export function enqueue(pending: readonly PendingBall[], item: PendingBall): PendingBall[] {
  if (pending.some((p) => p.requestId === item.requestId)) return [...pending];
  return [...pending, item];
}

/** Drop the most recently queued delivery — the local half of undo. */
export function dropLast(pending: readonly PendingBall[]): {
  pending: PendingBall[];
  removed: PendingBall | null;
} {
  if (pending.length === 0) return { pending: [], removed: null };
  const sorted = [...pending].sort((a, b) => a.seq - b.seq);
  const removed = sorted[sorted.length - 1]!;
  return { pending: sorted.slice(0, -1), removed };
}

/** The server has this delivery. Take it out of the queue. */
export function ack(pending: readonly PendingBall[], requestId: string): PendingBall[] {
  return pending.filter((p) => p.requestId !== requestId);
}

/** The delivery to send next, or null when the queue is empty. */
export function head(pending: readonly PendingBall[]): PendingBall | null {
  if (pending.length === 0) return null;
  return [...pending].sort((a, b) => a.seq - b.seq)[0]!;
}

/**
 * Is this failure worth keeping the delivery for?
 *
 * The distinction the drain loop turns on, and the one that decides whether a
 * scorer's afternoon survives a bad connection.
 *
 * A **network** failure means nothing is known: the request may have been
 * recorded, or may never have arrived. The delivery stays queued and is resent
 * under the same `requestId`, and the server either records it or replies with
 * the answer it already gave.
 *
 * A **refusal** — the engine rejecting the delivery, or the server saying it
 * already has it — is an answer. Resending cannot change it, and a queue that
 * retries an answer forever never drains.
 */
export function isRetryable(status: number | null): boolean {
  // No status at all is a network failure: the request never got a reply.
  if (status === null) return true;
  // The server is there but cannot answer right now.
  return status === 429 || status >= 500;
}
