/**
 * A stable anonymous id for this install, so a heartbeat updates one row
 * instead of inserting a new viewer every interval.
 *
 * The same contract as the web's watcher key: it is not a person — nothing
 * joins it to an account, it is sent nowhere except the watching heartbeat,
 * and clearing the app's data creates a new one. SecureStore is already in
 * the app for tokens; an anonymous id is not a secret, but it is the storage
 * that is guaranteed to exist.
 */
import * as SecureStore from 'expo-secure-store';
import { newUuid } from '@open-innings/scoring';

const WATCHER_KEY = 'oi_watcher_key';

export async function watcherKey(): Promise<string | null> {
  try {
    const existing = await SecureStore.getItemAsync(WATCHER_KEY);
    if (existing) return existing;
    const created = newUuid();
    await SecureStore.setItemAsync(WATCHER_KEY, created);
    return created;
  } catch {
    // Unavailable storage. No key means no heartbeat, which means this reader
    // is not counted — a smaller failure than breaking the card for the sake
    // of a number.
    return null;
  }
}
