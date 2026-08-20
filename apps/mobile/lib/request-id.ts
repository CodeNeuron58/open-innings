/**
 * An id for one delivery, stable across retries of that delivery.
 *
 * The server derives a ball's number from the stored log, which cannot
 * distinguish a resent request from a new ball: the first attempt succeeded,
 * its response was lost, and the re-read now returns one more ball than
 * before — so the retry computes the *next* number and the delivery is
 * recorded twice. Only a value minted by the side that knows which it is can
 * tell them apart. Migration 0013 has the full account.
 *
 * This is not a secret. It is scoped to an innings the caller already owns and
 * the server checks ownership independently, so what matters is uniqueness,
 * not unpredictability. It still prefers a real CSPRNG where the runtime has
 * one, because there is no reason not to.
 */

function bytes(): Uint8Array {
  const out = new Uint8Array(16);
  const c = globalThis.crypto as Crypto | undefined;

  if (c?.getRandomValues) {
    c.getRandomValues(out);
    return out;
  }

  // React Native does not guarantee a WebCrypto global, and the app pulls in
  // no polyfill for one. `Math.random` is a weak generator, but 122 bits of
  // it still makes a collision within a single innings not worth reasoning
  // about, and a guessed id is worth nothing without the session that owns
  // the match.
  for (let i = 0; i < 16; i += 1) out[i] = Math.floor(Math.random() * 256);
  return out;
}

export function newRequestId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();

  const b = bytes();
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 1
  const hex = Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A delivery that has been sent and whose outcome is not yet known. */
export type PendingDelivery = {
  /** The delivery's content, so "is this the same ball" is answerable. */
  signature: string;
  requestId: string;
};

/**
 * The id to send for a delivery: the pending one if this is the same delivery
 * being resent, a new one otherwise.
 *
 * Keyed on content rather than held blindly, and that is the whole correctness
 * argument. Reusing an id for a *different* delivery is the dangerous
 * direction — the server would recognise it, answer with the earlier ball's
 * state, and silently swallow the new one. Minting a fresh id for the *same*
 * delivery is merely the old bug: it records twice.
 *
 * The caller clears its pending slot on success, so two identical deliveries
 * in a row are two balls.
 */
export function requestIdFor(pending: PendingDelivery | null, signature: string): PendingDelivery {
  if (pending && pending.signature === signature) return pending;
  return { signature, requestId: newRequestId() };
}
