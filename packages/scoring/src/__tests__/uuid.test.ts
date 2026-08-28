/**
 * Minting a ball id where there is no WebCrypto.
 *
 * The engine used a bare `globalThis.crypto.randomUUID()`, which is present on
 * the server and in a browser and absent in React Native's Hermes. That was
 * harmless for as long as `applyBall` only ran on the server. Offline scoring
 * moved it onto the phone — the console folds pending deliveries through this
 * same engine — and the first ball anybody scored in the app threw:
 *
 *   Cannot read property 'randomUUID' of undefined
 *
 * Scoring did not work at all, which is the whole product. Nothing caught it
 * because every test here runs under Node, where the global exists.
 *
 * So these tests take it away. `withCrypto` replaces the global for the length
 * of one call and puts it back, which is what lets a Node test stand in for a
 * phone.
 */
import { describe, it, expect } from 'vitest';
import { newUuid } from '../uuid';
import { applyBall } from '../engine';
import { initialState } from '../compute';
import { asInningsId, asPlayerId, type MatchState, type BallEventInput } from '../types';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Run `fn` with `globalThis.crypto` replaced, then restore whatever was there. */
function withCrypto<T>(replacement: unknown, fn: () => T): T {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', {
    value: replacement,
    configurable: true,
    writable: true,
  });
  try {
    return fn();
  } finally {
    if (original) Object.defineProperty(globalThis, 'crypto', original);
    else delete (globalThis as { crypto?: unknown }).crypto;
  }
}

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
    strikerId: 'p1',
    nonStrikerId: 'p2',
    bowlerId: 'p3',
  });

const dot: BallEventInput = {
  inningsId: asInningsId('i1'),
  eventType: 'dot',
  runsOffBat: 0,
  extraRuns: 0,
  batsmanId: asPlayerId('p1'),
  nonStrikerId: asPlayerId('p2'),
  bowlerId: asPlayerId('p3'),
};

describe('newUuid', () => {
  it('returns a v4 uuid where the runtime has one', () => {
    expect(newUuid()).toMatch(V4);
  });

  // The phone. This is the case that was broken.
  it('returns a v4 uuid with no crypto global at all', () => {
    withCrypto(undefined, () => {
      expect(newUuid()).toMatch(V4);
    });
  });

  // A runtime with getRandomValues but no randomUUID — older Safari, and some
  // polyfills. The bytes path has to set the version and variant itself.
  it('sets version and variant when it has to build the id from bytes', () => {
    const bytesOnly = {
      getRandomValues: (a: Uint8Array) => {
        // Every bit set, so a wrong mask is visible rather than lucky.
        a.fill(0xff);
        return a;
      },
    };
    withCrypto(bytesOnly, () => {
      const id = newUuid();
      expect(id).toMatch(V4);
      expect(id[14]).toBe('4'); // version nibble
      expect(['8', '9', 'a', 'b']).toContain(id[19]); // variant nibble
    });
  });

  it('does not collide across a full innings worth of ids', () => {
    withCrypto(undefined, () => {
      const ids = new Set(Array.from({ length: 5_000 }, () => newUuid()));
      expect(ids.size).toBe(5_000);
    });
  });
});

describe('applyBall without a crypto global', () => {
  // The actual regression: a delivery arriving with no id has to get one.
  it('mints a ball id rather than throwing', () => {
    withCrypto(undefined, () => {
      const next = applyBall(seed(), dot);
      expect(next.balls).toHaveLength(1);
      expect(next.balls[0]!.id).toMatch(V4);
    });
  });

  it('still honours an id the caller supplied', () => {
    withCrypto(undefined, () => {
      const next = applyBall(seed(), { ...dot, id: 'given-id' });
      expect(next.balls[0]!.id).toBe('given-id');
    });
  });
});
