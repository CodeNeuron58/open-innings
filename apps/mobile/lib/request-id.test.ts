/**
 * Whether a delivery gets a fresh id or reuses the pending one.
 *
 * This is the client half of migration 0013. The server can recognise a resent
 * delivery, but only if the client sends the same id — and the rule for
 * deciding that has two failure directions with very different costs:
 *
 *   Minting a new id for the SAME delivery is the original bug. A lost
 *   response, a re-tap, and the ball is recorded twice.
 *
 *   Reusing an id for a DIFFERENT delivery is worse. The server recognises
 *   it, answers with the earlier ball's state, and the new delivery is
 *   silently swallowed — no error, and a scorecard that is quietly a ball
 *   short.
 *
 * So both directions are asserted, not just the happy one.
 */
import { describe, it, expect } from 'vitest';
import { newRequestId, requestIdFor, type PendingDelivery } from './request-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('newRequestId', () => {
  it('is a v4 uuid, because the column is a uuid', () => {
    expect(newRequestId()).toMatch(UUID);
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 2000 }, newRequestId));
    expect(seen.size).toBe(2000);
  });
});

describe('requestIdFor', () => {
  const four = JSON.stringify({ eventType: 'runs', runsOffBat: 4 });
  const six = JSON.stringify({ eventType: 'runs', runsOffBat: 6 });

  it('mints an id when nothing is pending', () => {
    const first = requestIdFor(null, four);
    expect(first.requestId).toMatch(UUID);
    expect(first.signature).toBe(four);
  });

  it('reuses the id when the same delivery is resent', () => {
    // The retry case. A failed send never advances local state, so re-tapping
    // composes a byte-identical ball — and the server can then answer with the
    // success whose response was lost.
    const first = requestIdFor(null, four);
    const retry = requestIdFor(first, four);
    expect(retry.requestId).toBe(first.requestId);
    expect(retry).toBe(first);
  });

  it('reuses across any number of attempts', () => {
    let p = requestIdFor(null, four);
    const original = p.requestId;
    for (let i = 0; i < 5; i += 1) p = requestIdFor(p, four);
    expect(p.requestId).toBe(original);
  });

  it('mints a NEW id for a different delivery — the dangerous direction', () => {
    // If this ever reused, the server would recognise the id, return the
    // four's state, and the six would vanish without an error.
    const four1 = requestIdFor(null, four);
    const six1 = requestIdFor(four1, six);
    expect(six1.requestId).not.toBe(four1.requestId);
    expect(six1.signature).toBe(six);
  });

  it('treats two identical deliveries as two balls once the first has landed', () => {
    // The caller clears its pending slot on success. Two dot balls in a row
    // must be two rows, not one.
    const first = requestIdFor(null, four);
    const afterSuccess = requestIdFor(null, four);
    expect(afterSuccess.requestId).not.toBe(first.requestId);
  });

  it('does not reuse when the delivery differs only in one field', () => {
    // Signatures come from JSON.stringify of the composed ball, so a changed
    // striker or bowler is a different delivery even at the same run value.
    const a = JSON.stringify({ runsOffBat: 1, batsmanId: 'p1' });
    const b = JSON.stringify({ runsOffBat: 1, batsmanId: 'p2' });
    const pendingA: PendingDelivery = requestIdFor(null, a);
    expect(requestIdFor(pendingA, b).requestId).not.toBe(pendingA.requestId);
  });
});
