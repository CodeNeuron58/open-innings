/**
 * Where the API lives.
 *
 * Resolution order:
 *   1. EXPO_PUBLIC_API_URL — set this for closed testing and production.
 *      Expo inlines EXPO_PUBLIC_* at build time.
 *   2. In dev, the LAN address Metro is already serving from. A phone can't
 *      reach `localhost` — that's the phone itself — but it is on the same
 *      wifi as the dev machine, and Metro knows that machine's address. So
 *      `pnpm dev` in apps/web plus `pnpm start` here just works, with nothing
 *      to configure and no IP to hardcode and forget about.
 */
import Constants from 'expo-constants';

const DEV_WEB_PORT = 3000;

function metroHost(): string | null {
  // hostUri is "192.168.1.42:8081" in a dev build; debuggerHost is the Expo Go
  // equivalent. Either gives us the dev machine's address on the local network.
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;

  const host = hostUri?.split(':')[0];
  return host && host.length > 0 ? host : null;
}

function resolveApiBase(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, '');

  const host = metroHost();
  if (host) return `http://${host}:${DEV_WEB_PORT}`;

  // Not fatal at import time — surfaces as a network error with a message
  // that says what to do, rather than a mystery fetch failure.
  return '';
}

export const API_BASE = resolveApiBase();

export const MISSING_API_BASE_MESSAGE =
  'No API URL. Set EXPO_PUBLIC_API_URL, or run the Expo dev server on the same network as the web app.';

/**
 * Public links — the scorecard and the share cards.
 *
 * The same origin as the API, because the web app serves both `/api` and the
 * public pages. That makes shared links correct everywhere for free: in
 * production `EXPO_PUBLIC_API_URL` is the real domain, and in dev it is the
 * LAN address, which opens on any phone on the same wifi — which is exactly
 * what you want when testing whether a scorecard is worth sending to anyone.
 */
export const shareUrls = {
  match: (matchId: string) => `${API_BASE}/m/${matchId}`,
  playerInMatch: (matchId: string, playerId: string) => `${API_BASE}/m/${matchId}/p/${playerId}`,
  player: (playerId: string) => `${API_BASE}/p/${playerId}`,
};
