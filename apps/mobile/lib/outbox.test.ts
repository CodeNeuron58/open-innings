/**
 * The queue the console shows the score from.
 *
 * The claim these exist to hold up: **the device is not guessing.** The
 * projection runs the server's own engine on the server's own last answer, so
 * folding a delivery locally and having the server fold the same delivery must
 * reach the same state — not approximately, identically. The last test in this
 * file asserts exactly that, because if it is ever false the whole design is
 * unsound and a scorer's card silently disagrees with the one they shared.
 */
import { describe, it, expect } from 'vitest';
import {
  applyBall,
  initialState,
  type BallEventInput,
  type MatchState,
} from '@open-innings/scoring';
import {
  ack,
  dropLast,
  enqueue,
  head,
  isRetryable,
  nextSeq,
  project,
  type PendingBall,
} from './outbox';

const seed = (): MatchState =>
  initialState({
    matchId: 'm1',
    oversPerInnings: 20,
    teamAId: 'A',
    teamBId: 'B',
    battingTeamId: 'A',
    bowlingTeamId: 'B',
    inningsId: 'i1',
    inningsNumber: 1,
    strikerId: 'b1',
    nonStrikerId: 'b2',
    bowlerId: 'w1',
  });

/** A delivery from whoever is at the crease in `state`. */
function ball(state: MatchState, over: Partial<BallEventInput> = {}): BallEventInput {
  const inn = state.currentInnings;
  return {
    inningsId: inn.id,
    eventType: 'dot',
    runsOffBat: 0,
    extraRuns: 0,
    batsmanId: inn.strikerId,
    nonStrikerId: inn.nonStrikerId,
    bowlerId: inn.currentBowlerId,
    ...over,
  };
}

let seqCounter = 0;
function queued(state: MatchState, over: Partial<BallEventInput> = {}): PendingBall {
  seqCounter += 1;
  return {
    seq: seqCounter,
    requestId: `req-${seqCounter}`,
    ball: ball(state, over),
    queuedAt: 1_700_000_000_000 + seqCounter,
  };
}

describe('projecting the queue onto server state', () => {
  it('shows the server state when nothing is queued', () => {
    const s = seed();
    expect(project(s, []).state).toBe(s);
  });

  it('folds a queued delivery onto the score', () => {
    const s = seed();
    const { state } = project(s, [queued(s, { eventType: '4', runsOffBat: 4, totalRuns: 4 })]);

    expect(state.currentInnings.runs).toBe(4);
    expect(state.currentInnings.ballsBowled).toBe(1);
  });

  it('folds a whole over in the order it was bowled', () => {
    // Six deliveries queued with no signal, which is the case this exists for.
    let s = seed();
    const pending: PendingBall[] = [];
    let projected = s;

    for (const runs of [1, 0, 4, 2, 0, 6]) {
      const item = queued(projected, {
        eventType: runs === 0 ? 'dot' : (String(runs) as BallEventInput['eventType']),
        runsOffBat: runs,
        totalRuns: runs,
      });
      pending.push(item);
      projected = applyBall(projected, item.ball);
    }

    const { state, rejected } = project(s, pending);
    expect(rejected).toEqual([]);
    expect(state.currentInnings.runs).toBe(13);
    expect(state.currentInnings.ballsBowled).toBe(6);
    // The over ended, so the engine is asking for a different bowler.
    expect(state.currentInnings.lastBowlerId).toBe(state.currentInnings.currentBowlerId);
    void s;
  });

  it('sorts by seq rather than trusting array order', () => {
    // Ordering is the whole contract: a ball log replayed out of order is a
    // different match. SQLite gives no ordering guarantee we have not asked
    // for, so the fold asks.
    const s = seed();
    const first = queued(s, { eventType: '4', runsOffBat: 4, totalRuns: 4 });
    const second = queued(applyBall(s, first.ball), {
      eventType: '1',
      runsOffBat: 1,
      totalRuns: 1,
    });

    const inOrder = project(s, [first, second]).state;
    const shuffled = project(s, [second, first]).state;

    expect(shuffled.currentInnings.runs).toBe(inOrder.currentInnings.runs);
    expect(shuffled.currentInnings.ballsBowled).toBe(inOrder.currentInnings.ballsBowled);
  });

  it('reports a delivery the engine refuses instead of throwing', () => {
    /*
     * The case: the server state moved underneath the queue — another device
     * scored the match, or a correction replayed the innings — and a queued
     * delivery names a batter who is no longer at the crease.
     *
     * A scorer holding six unsynced balls must not be shown a crash. Five of
     * them are probably still good.
     */
    const s = seed();
    const impossible: PendingBall = {
      seq: 99,
      requestId: 'req-impossible',
      ball: ball(s, { batsmanId: s.currentInnings.currentBowlerId }),
      queuedAt: 0,
    };

    const { rejected } = project(s, [impossible]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.pending.requestId).toBe('req-impossible');
    expect(rejected[0]!.code).not.toBe('UNKNOWN');
  });

  it('keeps folding the deliveries after a refused one', () => {
    const s = seed();
    const bad: PendingBall = {
      seq: 1,
      requestId: 'bad',
      ball: ball(s, { batsmanId: s.currentInnings.currentBowlerId }),
      queuedAt: 0,
    };
    const good: PendingBall = {
      seq: 2,
      requestId: 'good',
      ball: ball(s, { eventType: '4', runsOffBat: 4, totalRuns: 4 }),
      queuedAt: 0,
    };

    const { state, rejected } = project(s, [bad, good]);
    expect(rejected).toHaveLength(1);
    expect(state.currentInnings.runs).toBe(4);
  });

  it('does not mutate the queue it is given', () => {
    const s = seed();
    const pending = [queued(s), queued(s)];
    const before = pending.map((p) => p.seq);
    project(s, pending);
    expect(pending.map((p) => p.seq)).toEqual(before);
  });
});

describe('queue algebra', () => {
  it('appends and hands back the head in seq order', () => {
    const s = seed();
    const a = { ...queued(s), seq: 2 };
    const b = { ...queued(s), seq: 1 };
    const q = enqueue(enqueue([], a), b);

    expect(q).toHaveLength(2);
    expect(head(q)!.seq).toBe(1);
  });

  it('refuses a duplicate requestId', () => {
    // The same guarantee the server's idempotency gives, one layer earlier: a
    // double-tap composing a byte-identical delivery mints the same id, and two
    // of them in the queue would be two balls on the board.
    const s = seed();
    const item = queued(s);
    const q = enqueue(enqueue([], item), { ...item, seq: item.seq + 1 });
    expect(q).toHaveLength(1);
  });

  it('drops the last queued delivery, which is the local half of undo', () => {
    const s = seed();
    const a = { ...queued(s), seq: 1 };
    const b = { ...queued(s), seq: 2 };

    const { pending, removed } = dropLast([a, b]);
    expect(removed!.seq).toBe(2);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.seq).toBe(1);
  });

  it('drops nothing from an empty queue', () => {
    // Undo with nothing pending is undoing a ball the server already has, and
    // that needs the network. Saying so is the caller's job; not crashing is
    // this one's.
    const { pending, removed } = dropLast([]);
    expect(removed).toBeNull();
    expect(pending).toEqual([]);
  });

  it('acknowledges by requestId', () => {
    const s = seed();
    const a = { ...queued(s), requestId: 'a' };
    const b = { ...queued(s), requestId: 'b' };
    expect(ack([a, b], 'a').map((p) => p.requestId)).toEqual(['b']);
  });

  it('hands out sequence numbers above everything queued', () => {
    const s = seed();
    expect(nextSeq([])).toBe(1);
    expect(
      nextSeq([
        { ...queued(s), seq: 7 },
        { ...queued(s), seq: 3 },
      ]),
    ).toBe(8);
  });

  it('returns no head for an empty queue', () => {
    expect(head([])).toBeNull();
  });
});

describe('what is worth resending', () => {
  it('keeps a delivery whose request never got a reply', () => {
    // Nothing is known: it may have been recorded, or may never have arrived.
    // The requestId is what makes resending safe.
    expect(isRetryable(null)).toBe(true);
  });

  it('keeps a delivery the server was too busy or too broken to take', () => {
    expect(isRetryable(429)).toBe(true);
    expect(isRetryable(500)).toBe(true);
    expect(isRetryable(503)).toBe(true);
  });

  it('gives up on a refusal, because resending cannot change an answer', () => {
    // A queue that retries an answer forever never drains, and the scorer is
    // told "3 balls waiting" for the rest of the match.
    expect(isRetryable(400)).toBe(false);
    expect(isRetryable(401)).toBe(false);
    expect(isRetryable(409)).toBe(false);
    expect(isRetryable(422)).toBe(false);
  });
});

describe('the device is not guessing', () => {
  it('folding locally reaches the state the server would have sent back', () => {
    /*
     * The claim the whole design rests on.
     *
     * `packages/scoring` is a workspace dependency of both the app and the
     * API, so `applyBall` here is the same function `applyBall` there. The
     * projection is therefore not a prediction of the server's answer — it is
     * the server's own arithmetic, run on the server's own last answer.
     *
     * If this is ever false, the console shows one score and the shared
     * scorecard shows another, and nothing in the app would say so.
     */
    const s = seed();

    const deliveries: Partial<BallEventInput>[] = [
      { eventType: '1', runsOffBat: 1, totalRuns: 1 },
      { eventType: 'wide', extraRuns: 1, totalRuns: 1 },
      { eventType: '4', runsOffBat: 4, totalRuns: 4 },
      { eventType: 'dot' },
      { eventType: 'no_ball', extraRuns: 1, runsOffBat: 2, totalRuns: 3 },
      { eventType: '6', runsOffBat: 6, totalRuns: 6 },
    ];

    // What the server would hold, having taken each delivery in turn.
    let serverSide = s;
    const pending: PendingBall[] = [];
    for (const [i, over] of deliveries.entries()) {
      const b = ball(serverSide, over);
      pending.push({ seq: i + 1, requestId: `r${i}`, ball: b, queuedAt: i });
      serverSide = applyBall(serverSide, b);
    }

    // What the device shows, having sent none of them.
    const local = project(s, pending).state;

    expect(local.currentInnings.runs).toBe(serverSide.currentInnings.runs);
    expect(local.currentInnings.wickets).toBe(serverSide.currentInnings.wickets);
    expect(local.currentInnings.ballsBowled).toBe(serverSide.currentInnings.ballsBowled);
    expect(local.currentInnings.extras).toBe(serverSide.currentInnings.extras);
    expect(local.batting).toEqual(serverSide.batting);
    expect(local.bowling).toEqual(serverSide.bowling);
  });

  it('acknowledging a delivery does not move the score', () => {
    // The moment a ball syncs, it leaves `pending` and `serverState` advances
    // by exactly that ball. The projection has to be unchanged across that
    // swap, or the score would flicker every time the network caught up.
    const s = seed();
    const first = queued(s, { eventType: '4', runsOffBat: 4, totalRuns: 4 });
    const rest = queued(applyBall(s, first.ball), {
      eventType: '1',
      runsOffBat: 1,
      totalRuns: 1,
    });

    const beforeAck = project(s, [first, rest]).state;

    // The server took the first one and told us the state it reached.
    const afterServerTookFirst = applyBall(s, first.ball);
    const afterAck = project(afterServerTookFirst, ack([first, rest], first.requestId)).state;

    expect(afterAck.currentInnings.runs).toBe(beforeAck.currentInnings.runs);
    expect(afterAck.currentInnings.ballsBowled).toBe(beforeAck.currentInnings.ballsBowled);
    expect(afterAck.batting).toEqual(beforeAck.batting);
  });
});
