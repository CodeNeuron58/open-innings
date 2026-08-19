/**
 * API configuration and resolution.
 * Resolves to EXPO_PUBLIC_API_URL or the Metro dev server LAN address.
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
 * Public links for scorecards and share cards.
 * Uses the same origin as the API.
 */
export const shareUrls = {
  match: (matchId: string) => `${API_BASE}/m/${matchId}`,
  playerInMatch: (matchId: string, playerId: string) => `${API_BASE}/m/${matchId}/p/${playerId}`,
  player: (playerId: string) => `${API_BASE}/p/${playerId}`,
  club: (teamId: string) => `${API_BASE}/c/${teamId}`,

  /*
   * The scorebook as a file. Opened in the browser for native download handling.
   */
  exportMatch: (matchId: string, format: 'csv' | 'json') =>
    `${API_BASE}/api/matches/${matchId}/export?format=${format}`,

  /*
   * The card images themselves — the 1080×1080 PNGs Satori renders.
   *
   * `opengraph-image` is Next's own convention: the file
   * `app/m/[matchId]/opengraph-image.tsx` is served at this path. The share
   * screens point an <Image> straight at it, so the preview a scorer sees is
   * the exact bytes WhatsApp will render rather than a second drawing of the
   * same card that can drift from it.
   */
  /*
   * The square card — 1080 × 1080, what gets *sent as an image*.
   *
   * Not `opengraph-image`, which is the 1200×630 a link preview unfurls into.
   * A status crops a landscape card to a strip; a link preview letterboxes a
   * square one. Both are generated from the same facts.
   */
  matchCardImage: (matchId: string) => `${API_BASE}/m/${matchId}/square`,
  playerCardImage: (matchId: string, playerId: string) =>
    `${API_BASE}/m/${matchId}/p/${playerId}/square`,
};

/** Both cards the app previews are square. */
export const CARD_ASPECT_RATIO = 1;
