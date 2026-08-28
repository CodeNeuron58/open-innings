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

import { newUuid } from '@open-innings/scoring';

/*
 * The generator itself lives in `@open-innings/scoring`, which this app
 * already depends on and which needs the same thing to mint a ball id.
 *
 * It was written out here as well, and the engine's copy was the bare
 * `globalThis.crypto.randomUUID()` — so the half with the React Native
 * fallback was the half that did not run on the phone. Scoring a ball threw
 * `Cannot read property 'randomUUID' of undefined`. One implementation now,
 * in the package both sides import.
 */
export function newRequestId(): string {
  return newUuid();
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
