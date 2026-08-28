/**
 * A v4 UUID, in every runtime this package claims to run in.
 *
 * The engine mints one for a delivery that arrives without an id, and it used
 * to do that with a bare `globalThis.crypto.randomUUID()`. That is fine on the
 * server and in a browser and throws on a phone:
 *
 *   Cannot read property 'randomUUID' of undefined
 *
 * because React Native's Hermes ships no WebCrypto global and this app pulls
 * in no polyfill for one. The line was written when `applyBall` only ever ran
 * on the server. Offline scoring moved it onto the phone — the console folds
 * pending deliveries through this same engine — so the first ball scored in
 * the app hit it, and scoring did not work at all.
 *
 * This package has no dependencies on purpose, so the fallback lives here
 * rather than being imported from `@open-innings/shared`. `newRequestId` in
 * the mobile app delegates to this, so there is one implementation.
 *
 * Not a secret. A ball id identifies a row in an innings the caller already
 * owns, and the server checks that ownership itself — so what is needed is
 * uniqueness, not unpredictability. It still prefers a real CSPRNG wherever
 * the runtime has one, because there is no reason not to.
 */

/*
 * Structural, not the DOM's `Crypto`.
 *
 * This package compiles with `lib: ["esnext"]` and no DOM on purpose — it is
 * the one that has to run in Node, a browser and Hermes alike, so naming a
 * DOM type here would be the same category of mistake as the bug below.
 * Describing only the two methods used says what is actually required.
 */
type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
};

/** 16 random bytes, from the best generator the runtime offers. */
function randomBytes(): Uint8Array {
  const out = new Uint8Array(16);
  const c = (globalThis as { crypto?: CryptoLike }).crypto;

  if (typeof c?.getRandomValues === 'function') {
    c.getRandomValues(out);
    return out;
  }

  /*
   * `Math.random` is a weak generator, and 122 bits of it still puts a
   * collision inside one innings far beyond anything worth reasoning about.
   * A guessed id is worth nothing without the session that owns the match.
   */
  for (let i = 0; i < 16; i += 1) out[i] = Math.floor(Math.random() * 256);
  return out;
}

export function newUuid(): string {
  const c = (globalThis as { crypto?: CryptoLike }).crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();

  const b = randomBytes();
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 1
  const hex = Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
